use crate::{Error, PreferenceStore};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "../../../apps/desktop/src/generated/")]
pub enum SystemAction {
    EnableGameMode,
    DisableGameCapture,
    DisableMouseAcceleration,
    HighPerformancePower,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../apps/desktop/src/generated/")]
pub struct StreamVideo {
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub bitrate: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../apps/desktop/src/generated/")]
pub struct OptimizationPlan {
    pub summary: String,
    pub system_actions: Vec<SystemAction>,
    pub video: StreamVideo,
    pub provider: String,
    pub model: String,
    pub warnings: Vec<String>,
}
impl OptimizationPlan {
    pub fn validate(&self) -> Result<(), Error> {
        if self.summary.len() > 2000
            || self.system_actions.len() > 4
            || self
                .system_actions
                .iter()
                .collect::<std::collections::BTreeSet<_>>()
                .len()
                != self.system_actions.len()
        {
            return Err(Error::Invalid(
                "Plano inválido ou com ações duplicadas".into(),
            ));
        }
        self.video.validate()
    }
    pub fn offline() -> Self {
        Self{summary:"Preset local conservador: Game Mode, captura Game DVR desativada e OBS 720p30. Revise as trocas antes de aplicar.".into(),system_actions:vec![SystemAction::EnableGameMode,SystemAction::DisableGameCapture],video:StreamVideo{width:1280,height:720,fps:30,bitrate:3500},provider:"offline".into(),model:"preset-local-v1".into(),warnings:vec!["Nenhum ganho de FPS é garantido. O OBS usará x264/veryfast; confira o uso de CPU antes de transmitir.".into()]}
    }
    pub fn offline_for(goal: Option<&str>) -> Result<Self, Error> {
        let mut plan = Self::offline();
        match goal {
            None | Some("Jogar e transmitir com estabilidade") => {}
            Some("Priorizar jogo competitivo") => {
                plan.summary = "Plano local para jogo competitivo: revise Modo de Jogo e captura. A resposta do mouse é uma opção manual; energia permanece à sua escolha.".into();
                plan.system_actions
                    .push(SystemAction::DisableMouseAcceleration);
            }
            Some("Equilibrar desempenho e consumo") => {
                plan.summary = "Plano local equilibrado: habilitar Modo de Jogo, preservando captura, mouse e energia por padrão. Outros ajustes são opcionais e exigem seleção.".into();
                plan.system_actions = vec![SystemAction::EnableGameMode];
            }
            Some(_) => return Err(Error::Invalid("Objetivo local não reconhecido".into())),
        }
        plan.validate()?;
        Ok(plan)
    }
}
impl StreamVideo {
    pub fn validate(&self) -> Result<(), Error> {
        if !matches!((self.width, self.height), (1280, 720) | (1920, 1080))
            || !matches!(self.fps, 30 | 60)
            || !(1500..=12000).contains(&self.bitrate)
        {
            return Err(Error::Invalid("Vídeo fora dos limites permitidos".into()));
        }
        Ok(())
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../apps/desktop/src/generated/")]
pub struct Operation {
    pub id: String,
    pub kind: String,
    pub status: String,
    pub summary: String,
    pub error: Option<String>,
    #[ts(type = "unknown")]
    pub payload: Value,
}
pub(crate) fn stamp() -> Result<String, Error> {
    Ok(std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| Error::Invalid(e.to_string()))?
        .as_nanos()
        .to_string())
}
impl PreferenceStore {
    pub fn record_plan(&self, plan: &OptimizationPlan) -> Result<(), Error> {
        plan.validate()?;
        let op = Operation {
            id: stamp()?,
            kind: "plan".into(),
            status: "planned".into(),
            summary: plan.summary.clone(),
            error: None,
            payload: serde_json::to_value(plan)?,
        };
        self.save_operation(&op)
    }
    pub(crate) fn operation(&self, id: &str) -> Result<Operation, Error> {
        let data: String =
            self.connection()?
                .query_row("SELECT data FROM operations WHERE id=?1", [id], |r| {
                    r.get(0)
                })?;
        Ok(serde_json::from_str(&data)?)
    }
    pub(crate) fn save_operation(&self, op: &Operation) -> Result<(), Error> {
        self.connection()?.execute("INSERT INTO operations(id,kind,data) VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET data=excluded.data",rusqlite::params![op.id,op.kind,serde_json::to_string(op)?])?;
        Ok(())
    }
    pub fn operations(&self) -> Result<Vec<Operation>, Error> {
        let c = self.connection()?;
        let mut s = c.prepare("SELECT data FROM operations ORDER BY seq DESC LIMIT 100")?;
        let rows = s.query_map([], |r| r.get::<_, String>(0))?;
        let mut out = Vec::new();
        for r in rows {
            out.push(serde_json::from_str(&r?)?);
        }
        Ok(out)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_invalid_video_and_duplicate_actions() {
        let mut p = OptimizationPlan::offline();
        assert!(p.validate().is_ok());
        p.system_actions.push(SystemAction::EnableGameMode);
        assert!(p.validate().is_err());
        p = OptimizationPlan::offline();
        p.video.bitrate = 999999;
        assert!(p.validate().is_err());
    }
    #[test]
    fn refuses_unknown_action() {
        assert!(serde_json::from_str::<SystemAction>("\"disable_antivirus\"").is_err());
    }
    #[test]
    fn local_goals_preserve_energy_and_require_explicit_optional_selection() {
        let balanced = OptimizationPlan::offline_for(Some("Equilibrar desempenho e consumo"))
            .expect("balanced");
        assert_eq!(balanced.system_actions, vec![SystemAction::EnableGameMode]);
        let competitive =
            OptimizationPlan::offline_for(Some("Priorizar jogo competitivo")).expect("competitive");
        assert!(competitive
            .system_actions
            .contains(&SystemAction::DisableMouseAcceleration));
        assert!(!competitive
            .system_actions
            .contains(&SystemAction::HighPerformancePower));
        assert_eq!(
            OptimizationPlan::offline_for(None)
                .expect("legacy")
                .system_actions,
            OptimizationPlan::offline().system_actions
        );
        assert!(OptimizationPlan::offline_for(Some("run_shell")).is_err());
    }
}
