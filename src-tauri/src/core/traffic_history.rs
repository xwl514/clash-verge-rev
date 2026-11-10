use anyhow::{Context, Result};
use clash_verge_traffic::{ConnectionSample, Snapshot, TrafficHistory, TrafficStore};
use serde::Serialize;
use std::{
    sync::{LazyLock, Mutex},
    time::Duration,
};

use crate::{core::handle::Handle, process::AsyncHandler, utils::dirs};

#[derive(Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum TrafficStatus {
    Recording,
    Waiting,
    StorageError,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TrafficHistoryView {
    pub history: TrafficHistory,
    pub status: TrafficStatus,
    pub last_sample: Option<i64>,
}

struct HistoryState {
    store: Option<TrafficStore>,
    status: TrafficStatus,
    last_sample: Option<i64>,
}

impl HistoryState {
    fn store(&mut self) -> Result<&mut TrafficStore> {
        if self.store.is_none() {
            self.store = Some(TrafficStore::open(
                &dirs::app_home_dir()?.join("traffic-history.sqlite3"),
            )?);
        }
        self.store.as_mut().context("Traffic history is unavailable")
    }
}

static HISTORY: LazyLock<Mutex<HistoryState>> = LazyLock::new(|| {
    Mutex::new(HistoryState {
        store: None,
        status: TrafficStatus::Waiting,
        last_sample: None,
    })
});

// Owned by application startup, independent of webview and connection-page lifetimes.
pub fn start() {
    AsyncHandler::spawn(|| async {
        let mut timer = tokio::time::interval(Duration::from_secs(1));
        timer.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            timer.tick().await;
            let requested_at = chrono::Utc::now().timestamp_millis();
            let snapshot = if Handle::global().is_exiting() {
                None
            } else {
                tokio::time::timeout(Duration::from_secs(3), Handle::mihomo().get_connections())
                    .await
                    .ok()
                    .and_then(Result::ok)
                    .map(|connections| Snapshot {
                        requested_at,
                        upload_total: connections.upload_total,
                        download_total: connections.download_total,
                        connections: connections
                            .connections
                            .unwrap_or_default()
                            .into_iter()
                            .map(|item| {
                                let host = if !item.metadata.host.is_empty() {
                                    item.metadata.host
                                } else if !item.metadata.destination_ip.is_empty() {
                                    item.metadata.destination_ip
                                } else {
                                    item.metadata.remote_destination
                                };
                                ConnectionSample {
                                    id: item.id,
                                    start: item.start,
                                    host,
                                    chains: item.chains,
                                    upload: item.upload,
                                    download: item.download,
                                }
                            })
                            .collect(),
                    })
            };
            let now = chrono::Utc::now().timestamp_millis();
            if let Err(error) = AsyncHandler::spawn_blocking(move || {
                let mut state = HISTORY
                    .lock()
                    .map_err(|_| anyhow::anyhow!("Traffic history lock poisoned"))?;
                let recording = snapshot.is_some();
                let result = state.store().and_then(|store| match snapshot {
                    Some(snapshot) => store.record(snapshot, now),
                    None => {
                        store.disconnect();
                        store.prune(now)
                    }
                });
                match result {
                    Ok(()) => {
                        state.status = if recording {
                            TrafficStatus::Recording
                        } else {
                            TrafficStatus::Waiting
                        };
                        if recording {
                            state.last_sample = Some(now);
                        }
                    }
                    Err(error) => {
                        if state.status != TrafficStatus::StorageError {
                            tracing::error!("Failed to persist traffic history: {error:#}");
                        }
                        state.status = TrafficStatus::StorageError;
                    }
                }
                Ok::<_, anyhow::Error>(())
            })
            .await
            .map_err(anyhow::Error::from)
            .and_then(|result| result)
            {
                tracing::error!("Traffic history worker failed: {error}");
            }
        }
    });
}

pub async fn query(from: i64, to: i64) -> Result<TrafficHistoryView> {
    AsyncHandler::spawn_blocking(move || {
        let mut state = HISTORY
            .lock()
            .map_err(|_| anyhow::anyhow!("Traffic history lock poisoned"))?;
        let now = chrono::Utc::now().timestamp_millis();
        let store = state.store()?;
        store.prune(now)?;
        let history = store.query(from, to, now)?;
        Ok(TrafficHistoryView {
            history,
            status: state.status,
            last_sample: state.last_sample,
        })
    })
    .await?
}
