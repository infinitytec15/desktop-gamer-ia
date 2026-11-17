use crate::{
    automation::{stamp, Operation},
    Error, PreferenceStore,
};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "../../../apps/desktop/src/generated/")]
pub enum WorkState {
    Questions,
    Planned,
    Approved,
    Running,
    Verified,
    Accepted,
    Failed,
    Cancelled,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../apps/desktop/src/generated/")]
pub struct WorkBrief {
    pub app_id: String,
    pub app_name: String,
    pub goal: String,
    pub experience: String,
    pub priority: String,
    pub notes: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../apps/desktop/src/generated/")]
pub struct WorkItem {
    pub brief: WorkBrief,
    pub state: WorkState,
    pub acceptance: Vec<String>,
    pub adapter: String,
    pub plan_id: Option<String>,
    pub approved_at: Option<String>,
    pub operation_id: Option<String>,
}
pub fn create(store: &PreferenceStore, brief: WorkBrief) -> Result<Operation, Error> {
    if brief.app_id.len() > 80
        || brief.app_name.is_empty()
        || brief.app_name.len() > 200
        || brief.goal.is_empty()
        || brief.goal.len() > 500
        || brief.notes.len() > 1000
        || brief.experience.len() > 80
        || brief.priority.len() > 80
    {
        return Err(Error::Invalid("Respostas fora dos limites".into()));
    }
    let inventory = crate::inventory::scan();
    let app = inventory
        .apps
        .iter()
        .find(|a| a.id == brief.app_id)
        .ok_or_else(|| {
            Error::Invalid("O programa não está mais no inventário. Atualize a lista.".into())
        })?;
    if brief.app_name != app.name {
        return Err(Error::Invalid(
            "Nome do programa não corresponde ao inventário".into(),
        ));
    }
    let item = WorkItem {
        brief,
        state: WorkState::Questions,
        acceptance: vec![
            "Objetivo e escopo revisados".into(),
            "Alterações aprovadas antes de executar".into(),
            "Resultado técnico verificado".into(),
            "Cliente confirmou o resultado".into(),
        ],
        adapter: app.adapter.clone(),
        plan_id: None,
        approved_at: None,
        operation_id: None,
    };
    let op = Operation {
        id: stamp()?,
        kind: "workflow".into(),
        status: "questions".into(),
        summary: format!("Configurar {}: {}", item.brief.app_name, item.brief.goal),
        error: None,
        payload: serde_json::to_value(item)?,
    };
    store.save_operation(&op)?;
    Ok(op)
}
fn allowed(from: &WorkState, to: &WorkState) -> bool {
    matches!(
        (from, to),
        (WorkState::Questions, WorkState::Planned)
            | (WorkState::Planned, WorkState::Approved)
            | (WorkState::Approved, WorkState::Running)
            | (WorkState::Running, WorkState::Verified)
            | (WorkState::Verified, WorkState::Accepted)
            | (WorkState::Questions, WorkState::Cancelled)
            | (WorkState::Planned, WorkState::Cancelled)
            | (WorkState::Approved, WorkState::Cancelled)
            | (WorkState::Running, WorkState::Failed)
    )
}
pub fn transition(
    store: &PreferenceStore,
    id: &str,
    to: WorkState,
    operation_id: Option<String>,
) -> Result<Operation, Error> {
    let _lock = store.acquire_lock()?;
    let mut op = store.operation(id)?;
    if op.kind != "workflow" {
        return Err(Error::Invalid("Solicitação inválida".into()));
    }
    let mut item: WorkItem = serde_json::from_value(op.payload.clone())?;
    if !allowed(&item.state, &to) {
        return Err(Error::Invalid(
            "Transição sem os aceites necessários".into(),
        ));
    }
    if to == WorkState::Planned {
        let plan = store.operation(operation_id.as_deref().ok_or_else(|| {
            Error::Invalid("Vincule um plano revisável antes de avançar".into())
        })?)?;
        if plan.kind != "plan" {
            return Err(Error::Invalid("Registro não é um plano".into()));
        }
        let parsed: crate::automation::OptimizationPlan = serde_json::from_value(plan.payload)?;
        parsed.validate()?;
        item.plan_id = Some(plan.id);
    }
    if to == WorkState::Approved {
        item.approved_at = Some(stamp()?);
    }
    if to == WorkState::Running {
        let exec = store.operation(
            operation_id
                .as_deref()
                .ok_or_else(|| Error::Invalid("Vincule uma operação técnica aprovada".into()))?,
        )?;
        if !["system", "obs", "discord"].contains(&exec.kind.as_str())
            || !["approved", "pending", "applied"].contains(&exec.status.as_str())
        {
            return Err(Error::Invalid("Operação técnica inválida".into()));
        }
        let expected = match item.adapter.as_str() {
            "obs" => "obs",
            "discord" => "discord",
            _ => "system",
        };
        if exec.kind != expected {
            return Err(Error::Invalid(
                "Execução não corresponde ao adaptador desta solicitação".into(),
            ));
        }
        let approval = item
            .approved_at
            .as_deref()
            .and_then(|s| s.parse::<u128>().ok())
            .ok_or_else(|| Error::Invalid("Aceite de execução ausente".into()))?;
        let execution = exec
            .id
            .parse::<u128>()
            .map_err(|_| Error::Invalid("Execução sem data válida".into()))?;
        if execution < approval {
            return Err(Error::Invalid(
                "A execução é anterior ao aceite. Não é possível aprovar retroativamente.".into(),
            ));
        }
        item.operation_id = Some(exec.id);
    }
    if to == WorkState::Verified || to == WorkState::Accepted {
        let exec = store.operation(
            item.operation_id
                .as_deref()
                .ok_or_else(|| Error::Invalid("Sem execução vinculada".into()))?,
        )?;
        if exec.status != "applied" {
            return Err(Error::Invalid("A execução ainda não foi verificada".into()));
        }
    }
    item.state = to;
    op.status = serde_json::to_value(&item.state)?
        .as_str()
        .unwrap_or("invalid")
        .into();
    op.payload = serde_json::to_value(item)?;
    store.save_operation(&op)?;
    Ok(op)
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn execution_and_acceptance_need_current_verified_evidence() {
        let store = PreferenceStore::new(
            std::env::temp_dir().join(format!("gf-work-{}", uuid::Uuid::new_v4())),
        );
        store
            .record_plan(&crate::automation::OptimizationPlan::offline())
            .expect("plan");
        let plan = store.operations().expect("history")[0].id.clone();
        let item = WorkItem {
            brief: WorkBrief {
                app_id: "fixture".into(),
                app_name: "Fixture".into(),
                goal: "Stability".into(),
                experience: "Beginner".into(),
                priority: "Balance".into(),
                notes: String::new(),
            },
            state: WorkState::Questions,
            acceptance: vec![],
            adapter: "guided".into(),
            plan_id: None,
            approved_at: None,
            operation_id: None,
        };
        let op = Operation {
            id: stamp().expect("id"),
            kind: "workflow".into(),
            status: "questions".into(),
            summary: "fixture".into(),
            error: None,
            payload: serde_json::to_value(item).expect("json"),
        };
        store.save_operation(&op).expect("save");
        assert!(transition(&store, &op.id, WorkState::Accepted, None).is_err());
        transition(&store, &op.id, WorkState::Planned, Some(plan)).expect("plan link");
        transition(&store, &op.id, WorkState::Approved, None).expect("approve");
        let mut exec = Operation {
            id: "1".into(),
            kind: "system".into(),
            status: "approved".into(),
            summary: "fixture".into(),
            error: None,
            payload: serde_json::Value::Null,
        };
        store.save_operation(&exec).expect("save");
        assert!(transition(&store, &op.id, WorkState::Running, Some(exec.id.clone())).is_err());
        exec.id = stamp().expect("id");
        store.save_operation(&exec).expect("save");
        transition(&store, &op.id, WorkState::Running, Some(exec.id.clone())).expect("run");
        assert!(transition(&store, &op.id, WorkState::Verified, None).is_err());
        exec.status = "applied".into();
        store.save_operation(&exec).expect("apply fixture");
        transition(&store, &op.id, WorkState::Verified, None).expect("verify");
        exec.status = "restored".into();
        store.save_operation(&exec).expect("undo fixture");
        assert!(transition(&store, &op.id, WorkState::Accepted, None).is_err());
        exec.status = "applied".into();
        store.save_operation(&exec).expect("apply fixture");
        transition(&store, &op.id, WorkState::Accepted, None).expect("accept");
        std::fs::remove_dir_all(&store.dir).expect("cleanup");
    }
    #[test]
    fn cannot_skip_client_acceptance_or_execution() {
        assert!(!allowed(&WorkState::Questions, &WorkState::Accepted));
        assert!(!allowed(&WorkState::Planned, &WorkState::Running));
        assert!(allowed(&WorkState::Planned, &WorkState::Approved));
        assert!(allowed(&WorkState::Verified, &WorkState::Accepted));
    }
}
