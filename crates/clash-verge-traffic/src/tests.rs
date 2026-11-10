use super::*;

const NOW: i64 = 1_800_000_000_000;

fn snapshot(upload: u64, download: u64) -> Snapshot {
    Snapshot {
        requested_at: NOW - 5_000,
        upload_total: upload + 10_000,
        download_total: download + 10_000,
        connections: vec![ConnectionSample {
            id: "connection".into(),
            start: chrono::DateTime::from_timestamp_millis(NOW - MINUTE_MS)
                .unwrap()
                .to_rfc3339(),
            host: "Example.COM.".into(),
            chains: vec!["Exit A".into(), "Proxy".into()],
            upload,
            download,
        }],
    }
}

#[test]
fn records_only_deltas_and_preserves_minute_and_route_boundaries() -> Result<()> {
    let mut store = TrafficStore::open(Path::new(":memory:"))?;
    store.record(snapshot(100, 1_000), NOW - 2_000)?;
    store.record(snapshot(110, 1_100), NOW - 1_000)?;
    store.record(snapshot(110, 1_100), NOW)?;
    let mut next = snapshot(130, 1_400);
    next.connections[0].chains[0] = "Exit B".into();
    store.record(next, NOW + 1_000)?;
    let history = store.query(NOW - MINUTE_MS, NOW + MINUTE_MS, NOW + 1_000)?;
    assert_eq!(history.records.len(), 2);
    assert_eq!(history.records.iter().map(|r| r.download).sum::<u64>(), 400);
    assert_eq!(
        history
            .points
            .iter()
            .map(|p| (p.timestamp, p.download))
            .collect::<Vec<_>>(),
        vec![(NOW - MINUTE_MS, 100), (NOW, 300)]
    );
    assert_eq!(history.records[0].host, "example.com");
    assert_eq!(history.records[0].first_seen, NOW - 1_000);
    assert_eq!(history.records[1].last_seen, NOW + 1_000);
    let hourly = store.query(NOW - 223 * MINUTE_MS, NOW + MINUTE_MS, NOW + 1_000)?;
    assert_eq!(hourly.interval_ms, 60 * MINUTE_MS);
    assert_eq!(hourly.points.len(), 1);
    assert_eq!(
        (hourly.points[0].timestamp, hourly.points[0].download),
        (NOW - 43 * MINUTE_MS, 400)
    );
    let daily = store.query(NOW - 7 * 24 * 60 * MINUTE_MS, NOW + MINUTE_MS, NOW + 1_000)?;
    assert_eq!(daily.interval_ms, 24 * 60 * MINUTE_MS);
    assert_eq!(daily.points.iter().map(|point| point.download).sum::<u64>(), 400);
    assert_eq!(store.query(NOW, NOW + MINUTE_MS, NOW + 1_000)?.records[0].download, 300);
    Ok(())
}

#[test]
fn restart_and_missing_samples_do_not_replay_lifetime_counters() -> Result<()> {
    let directory = tempfile::tempdir()?;
    let path = directory.path().join("history.sqlite3");
    {
        let mut store = TrafficStore::open(&path)?;
        store.record(snapshot(0, 100), NOW)?;
        store.record(snapshot(0, 120), NOW + 1_000)?;
    }
    let mut store = TrafficStore::open(&path)?;
    store.record(snapshot(0, 500), NOW + 2_000)?;
    store.record(snapshot(0, 510), NOW + 3_000)?;
    store.disconnect();
    store.record(snapshot(0, 800), NOW + 4_000)?;
    store.record(snapshot(0, 900), NOW + 30_000)?;
    store.record(snapshot(0, 10), NOW + 31_000)?;
    store.record(snapshot(0, 15), NOW + 32_000)?;
    assert_eq!(store.query(NOW, NOW + MINUTE_MS, NOW + 32_000)?.records[0].download, 35);
    Ok(())
}

#[test]
fn newly_started_connections_include_their_first_observed_bytes() -> Result<()> {
    let mut store = TrafficStore::open(Path::new(":memory:"))?;
    let mut previous = snapshot(0, 0);
    previous.requested_at = NOW - 100;
    store.record(previous, NOW)?;
    let mut next = snapshot(10, 200);
    next.connections[0].id = "new".into();
    next.connections[0].start = chrono::DateTime::from_timestamp_millis(NOW - 50).unwrap().to_rfc3339();
    store.record(next, NOW + 1_000)?;
    let record = store.query(NOW, NOW + MINUTE_MS, NOW + 1_000)?.records.remove(0);
    assert_eq!((record.upload, record.download), (10, 200));
    Ok(())
}

#[test]
fn failed_transactions_do_not_advance_the_sampling_baseline() -> Result<()> {
    let mut store = TrafficStore::open(Path::new(":memory:"))?;
    store.record(snapshot(0, 100), NOW)?;
    store.db.execute_batch(
        "CREATE TRIGGER fail_write BEFORE INSERT ON traffic_minutes BEGIN SELECT RAISE(ABORT, 'disk full'); END;",
    )?;
    assert!(store.record(snapshot(0, 120), NOW + 1_000).is_err());
    store.db.execute_batch("DROP TRIGGER fail_write;")?;
    store.record(snapshot(0, 140), NOW + 2_000)?;
    assert_eq!(store.query(NOW, NOW + MINUTE_MS, NOW + 2_000)?.records[0].download, 40);
    Ok(())
}

#[test]
fn retention_prunes_without_new_traffic_and_rejects_unavailable_ranges() -> Result<()> {
    let mut store = TrafficStore::open(Path::new(":memory:"))?;
    store.record(snapshot(0, 0), NOW)?;
    store.record(snapshot(0, 100), NOW + 1_000)?;
    let later = NOW + RETENTION_MS + MINUTE_MS;
    store.prune(later)?;
    let count: i64 = store
        .db
        .query_row("SELECT COUNT(*) FROM traffic_minutes", [], |r| r.get(0))?;
    assert_eq!(count, 0);
    assert!(store.query(NOW, NOW + MINUTE_MS, later).is_err());
    assert!(store.query(later, later, later).is_err());
    assert!(store.query(later, later + 2 * MINUTE_MS, later).is_err());
    let overlap = store.query(NOW, NOW + 2 * MINUTE_MS, later)?;
    assert_eq!(overlap.from, NOW + MINUTE_MS);
    Ok(())
}
