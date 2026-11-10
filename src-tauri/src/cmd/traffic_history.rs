use crate::{
    cmd::{CmdResult, StringifyErr},
    core::traffic_history::{self, TrafficHistoryView},
};

#[tauri::command]
#[specta::specta]
pub async fn get_traffic_history(from: i64, to: i64) -> CmdResult<TrafficHistoryView> {
    traffic_history::query(from, to).await.stringify_err()
}
