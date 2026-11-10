use anyhow::{Result, ensure};
use rusqlite::{Connection, params};
use serde::Serialize;
use std::{collections::HashMap, path::Path, time::Duration};

pub const MINUTE_MS: i64 = 60_000;
pub const RETENTION_MS: i64 = 30 * 24 * 60 * MINUTE_MS;
const MAX_SAMPLE_GAP_MS: i64 = 10_000;

pub struct ConnectionSample {
    pub id: String,
    pub start: String,
    pub host: String,
    pub chains: Vec<String>,
    pub upload: u64,
    pub download: u64,
}

pub struct Snapshot {
    pub requested_at: i64,
    pub connections: Vec<ConnectionSample>,
    pub upload_total: u64,
    pub download_total: u64,
}

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TrafficRecord {
    pub host: String,
    pub chains: Vec<String>,
    pub upload: u64,
    pub download: u64,
    pub first_seen: i64,
    pub last_seen: i64,
}

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TrafficPoint {
    pub timestamp: i64,
    pub host: String,
    pub upload: u64,
    pub download: u64,
}

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TrafficHistory {
    pub from: i64,
    pub to: i64,
    pub interval_ms: i64,
    pub records: Vec<TrafficRecord>,
    pub points: Vec<TrafficPoint>,
}

struct Counters {
    start: String,
    upload: u64,
    download: u64,
}

struct SampleBoundary {
    completed_at: i64,
    requested_at: i64,
    upload: u64,
    download: u64,
}

pub struct TrafficStore {
    db: Connection,
    previous: HashMap<String, Counters>,
    last_sample: Option<SampleBoundary>,
    last_prune: Option<i64>,
}

impl TrafficStore {
    pub fn open(path: &Path) -> Result<Self> {
        let db = Connection::open(path)?;
        db.busy_timeout(Duration::from_secs(2))?;
        db.execute_batch(
            "PRAGMA auto_vacuum = INCREMENTAL;
             PRAGMA journal_mode = WAL;
             CREATE TABLE IF NOT EXISTS traffic_minutes (
                 minute INTEGER NOT NULL,
                 host TEXT NOT NULL,
                 chains TEXT NOT NULL,
                 upload INTEGER NOT NULL,
                 download INTEGER NOT NULL,
                 first_seen INTEGER NOT NULL,
                 last_seen INTEGER NOT NULL,
                 PRIMARY KEY (minute, host, chains)
             ) WITHOUT ROWID;",
        )?;
        Ok(Self {
            db,
            previous: HashMap::new(),
            last_sample: None,
            last_prune: None,
        })
    }

    pub fn disconnect(&mut self) {
        self.previous.clear();
        self.last_sample = None;
    }

    pub fn prune(&mut self, now: i64) -> Result<()> {
        if self
            .last_prune
            .is_some_and(|last| now >= last && now - last < 60 * MINUTE_MS)
        {
            return Ok(());
        }
        let cutoff = (now - RETENTION_MS).div_euclid(MINUTE_MS) * MINUTE_MS;
        self.db
            .execute("DELETE FROM traffic_minutes WHERE minute < ?1", [cutoff])?;
        self.db.execute_batch("PRAGMA incremental_vacuum(2000);")?;
        self.last_prune = Some(now);
        Ok(())
    }

    pub fn record(&mut self, snapshot: Snapshot, now: i64) -> Result<()> {
        self.prune(now)?;
        let continuous = self.last_sample.as_ref().is_some_and(|last| {
            now > last.completed_at
                && now - last.completed_at <= MAX_SAMPLE_GAP_MS
                && snapshot.upload_total >= last.upload
                && snapshot.download_total >= last.download
        });
        let minute = now.div_euclid(MINUTE_MS) * MINUTE_MS;
        let tx = self.db.transaction()?;
        let mut next = HashMap::with_capacity(snapshot.connections.len());
        {
            let mut insert = tx.prepare_cached(
                "INSERT INTO traffic_minutes (minute, host, chains, upload, download, first_seen, last_seen)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
                 ON CONFLICT (minute, host, chains) DO UPDATE SET
                     upload = upload + excluded.upload,
                     download = download + excluded.download,
                     first_seen = MIN(first_seen, excluded.first_seen),
                     last_seen = MAX(last_seen, excluded.last_seen)",
            )?;
            for item in snapshot.connections {
                let (upload, download) = if continuous {
                    if let Some(previous) = self.previous.get(&item.id).filter(|old| old.start == item.start) {
                        (
                            item.upload.saturating_sub(previous.upload),
                            item.download.saturating_sub(previous.download),
                        )
                    } else {
                        let started = chrono::DateTime::parse_from_rfc3339(&item.start)
                            .ok()
                            .map(|time| time.timestamp_millis());
                        if started.is_some_and(|start| {
                            self.last_sample
                                .as_ref()
                                .is_some_and(|last| start >= last.requested_at && start <= now)
                        }) {
                            (item.upload, item.download)
                        } else {
                            (0, 0)
                        }
                    }
                } else {
                    // Startup, reconnects and sleep establish a baseline; their lifetime totals have no reliable time interval.
                    (0, 0)
                };
                if upload > 0 || download > 0 {
                    insert.execute(params![
                        minute,
                        item.host.trim_end_matches('.').to_lowercase(),
                        serde_json::to_string(&item.chains)?,
                        i64::try_from(upload)?,
                        i64::try_from(download)?,
                        now,
                    ])?;
                }
                next.insert(
                    item.id,
                    Counters {
                        start: item.start,
                        upload: item.upload,
                        download: item.download,
                    },
                );
            }
        }
        tx.commit()?;
        self.previous = next;
        self.last_sample = Some(SampleBoundary {
            completed_at: now,
            requested_at: snapshot.requested_at,
            upload: snapshot.upload_total,
            download: snapshot.download_total,
        });
        Ok(())
    }

    pub fn query(&self, from: i64, to: i64, now: i64) -> Result<TrafficHistory> {
        ensure!(from >= 0 && from < to, "Invalid traffic history time range");
        let earliest = (now - RETENTION_MS).div_euclid(MINUTE_MS) * MINUTE_MS;
        // Retention can advance while a frontend request is in flight.
        let from = (from.div_euclid(MINUTE_MS) * MINUTE_MS).max(earliest);
        let to = to.div_euclid(MINUTE_MS) * MINUTE_MS;
        ensure!(
            to <= now.div_euclid(MINUTE_MS) * MINUTE_MS + MINUTE_MS,
            "Time range must be within the last 30 days"
        );
        ensure!(from < to, "Select at least one minute");
        let interval_ms = if to - from <= 3 * 60 * MINUTE_MS {
            MINUTE_MS
        } else if to - from <= 3 * 24 * 60 * MINUTE_MS {
            60 * MINUTE_MS
        } else {
            24 * 60 * MINUTE_MS
        };
        let mut statement = self.db.prepare_cached(
            "SELECT host, chains, SUM(upload), SUM(download), MIN(first_seen), MAX(last_seen)
             FROM traffic_minutes WHERE minute >= ?1 AND minute < ?2 GROUP BY host, chains",
        )?;
        let mut rows = statement.query([from, to])?;
        let mut records = Vec::new();
        while let Some(row) = rows.next()? {
            records.push(TrafficRecord {
                host: row.get(0)?,
                chains: serde_json::from_str(&row.get::<_, String>(1)?)?,
                upload: read_bytes(row, 2)?,
                download: read_bytes(row, 3)?,
                first_seen: row.get(4)?,
                last_seen: row.get(5)?,
            });
        }
        let mut statement = self.db.prepare_cached(
            "SELECT ?1 + ((minute - ?1) / ?3) * ?3 AS bucket, host, SUM(upload), SUM(download)
             FROM traffic_minutes WHERE minute >= ?1 AND minute < ?2 GROUP BY bucket, host ORDER BY bucket",
        )?;
        let points = statement
            .query_map(params![from, to, interval_ms], |row| {
                Ok(TrafficPoint {
                    timestamp: row.get(0)?,
                    host: row.get(1)?,
                    upload: read_bytes(row, 2)?,
                    download: read_bytes(row, 3)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(TrafficHistory {
            from,
            to,
            interval_ms,
            records,
            points,
        })
    }
}

fn read_bytes(row: &rusqlite::Row<'_>, column: usize) -> rusqlite::Result<u64> {
    u64::try_from(row.get::<_, i64>(column)?).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(column, rusqlite::types::Type::Integer, Box::new(error))
    })
}

#[cfg(test)]
mod tests;
