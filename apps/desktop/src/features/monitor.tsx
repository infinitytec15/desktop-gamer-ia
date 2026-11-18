import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Activity, Pause, Play } from "lucide-react";
import type { Metrics } from "../generated/Metrics";
import "./monitor.css";
const value = (n: number | null | undefined, unit = "", digits = 1) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("pt-BR", { maximumFractionDigits: digits }) + unit;
function Chart({
  samples,
  series,
  max = 100,
  label,
  unit = "%",
}: {
  samples: Metrics[];
  series: {
    name: string;
    color: string;
    get: (s: Metrics) => number | null | undefined;
  }[];
  max?: number;
  label: string;
  unit?: string;
}) {
  const end = samples.at(-1)?.timestamp_ms || Date.now(),
    start = Math.max(end - 120000, samples[1]?.timestamp_ms || end - 1000),
    span = Math.max(1000, end - start);
  const recent = samples
    .slice(1)
    .filter((s) => (s.timestamp_ms || end) >= start);
  return (
    <div className="telemetry-chart" role="img" aria-label={label}>
      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.name}>
            <i style={{ background: s.color }} />
            {s.name}{" "}
            <b>
              {value(samples.length > 1 ? s.get(samples.at(-1)!) : null, unit)}
            </b>
          </span>
        ))}
      </div>
      <svg viewBox="0 0 600 150" preserveAspectRatio="none" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <line
            key={i}
            x1={0}
            x2={600}
            y1={i * 48 + 3}
            y2={i * 48 + 3}
            stroke="#34303f"
            strokeDasharray="3 5"
          />
        ))}
        {series.map((item) => {
          let path = "",
            pen = false;
          for (const sample of recent) {
            const n = item.get(sample);
            if (n === null || n === undefined || !Number.isFinite(n)) {
              pen = false;
              continue;
            }
            const x = Math.max(
                0,
                Math.min(
                  600,
                  (((sample.timestamp_ms || end) - start) / span) * 600,
                ),
              ),
              y = 147 - (Math.max(0, Math.min(max, n)) / max) * 142;
            path += (pen ? "L" : "M") + x.toFixed(1) + "," + y.toFixed(1);
            pen = true;
          }
          return (
            <path
              key={item.name}
              d={path}
              fill="none"
              stroke={item.color}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>
      <div className="chart-axis">
        <span>−{Math.round(span / 1000)} s</span>
        <span>−{Math.round(span / 2000)} s</span>
        <span>agora · escala 0–{value(max, unit, 0)}</span>
      </div>
    </div>
  );
}
export function MonitorPage() {
  const [samples, setSamples] = useState<Metrics[]>([]),
    [running, setRunning] = useState(false),
    [error, setError] = useState(""),
    [gpu, setGpu] = useState(0);
  useEffect(() => {
    if (!running) return;
    let active = true,
      inflight = false;
    const sample = async () => {
      if (inflight || document.hidden) return;
      inflight = true;
      try {
        const data = await invoke<Metrics>("monitor_sample");
        if (active)
          setSamples((old) => [
            ...old.slice(-119),
            { ...data, timestamp_ms: data.timestamp_ms || Date.now() },
          ]);
      } catch (e) {
        if (active) {
          setError(String(e));
          setRunning(false);
        }
      } finally {
        inflight = false;
      }
    };
    void sample();
    const timer = setInterval(() => void sample(), 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [running]);
  const current = samples.at(-1),
    ready = samples.length > 1,
    gpus = current?.gpus || [],
    sensors = current?.sensors || [];
  const hottest = (m: Metrics) => {
    const temperatures = [
      ...(m.sensors || []).map((s) => s.temperature),
      ...(m.gpus || []).map((g) => g.temperature_c),
    ].filter((t): t is number => typeof t === "number" && Number.isFinite(t));
    return temperatures.length ? Math.max(...temperatures) : null;
  };
  const ram = (m: Metrics) =>
    m.memory_total_gb > 0 ? (m.memory_used_gb / m.memory_total_gb) * 100 : null;
  const trafficMax = Math.max(
    1,
    ...samples.flatMap((s) => [
      s.network_receive_mbps || 0,
      s.network_transmit_mbps || 0,
    ]),
  );
  return (
    <div className="telemetry-page">
      <section className="panel">
        <div className="telemetry-header">
          <div>
            <h2>Monitor em tempo real</h2>
            <p className="muted">
              CPU, memória e tráfego a cada segundo; GPU, sensores e volumes em
              ciclos de pelo menos 3 segundos. Leituras lentas não se acumulam.
              Histórico local de até 120 amostras.
            </p>
          </div>
          <button
            className="secondary"
            onClick={() => {
              if (!isTauri()) {
                setError("Abra o aplicativo desktop para ler as métricas.");
                return;
              }
              setError("");
              setRunning((v) => !v);
            }}
          >
            {running ? <Pause size={16} /> : <Play size={16} />}{" "}
            {running ? "Pausar" : "Iniciar monitor"}
          </button>
        </div>
        <p className="telemetry-state">
          <Activity size={14} />
          {running
            ? "Coletando enquanto esta janela estiver visível"
            : "Monitor pausado"}
          {current &&
            " · última amostra " +
              new Date(current.timestamp_ms).toLocaleTimeString("pt-BR")}
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="telemetry-summary">
          <div>
            <span>CPU</span>
            <strong>{value(ready ? current?.cpu_usage : null, "%")}</strong>
            <small>
              {value(
                current?.cpu_frequency_mhz
                  ? current.cpu_frequency_mhz / 1000
                  : null,
                " GHz",
              )}{" "}
              reportados
            </small>
          </div>
          <div>
            <span>Memória RAM</span>
            <strong>{value(current ? ram(current) : null, "%")}</strong>
            <small>
              {value(current?.memory_used_gb, " GB")} de{" "}
              {value(current?.memory_total_gb, " GB")}
            </small>
          </div>
          <div>
            <span>GPU selecionada</span>
            <strong>{value(gpus[gpu]?.usage_percent, "%")}</strong>
            <small>{gpus[gpu]?.name || "Aguardando driver"}</small>
          </div>
          <div>
            <span>Maior temperatura reportada</span>
            <strong>{value(current ? hottest(current) : null, " °C")}</strong>
            <small>Somente sensores disponíveis</small>
          </div>
        </div>
        <div className="telemetry-grid">
          <Chart
            samples={samples}
            label="CPU e RAM nos últimos dois minutos"
            series={[
              { name: "CPU", color: "#b09bed", get: (s) => s.cpu_usage },
              { name: "RAM", color: "#77c9ad", get: ram },
            ]}
          />
          <Chart
            samples={samples}
            label="Utilização da GPU nos últimos dois minutos"
            series={[
              {
                name: "GPU",
                color: "#d2aa75",
                get: (s) => s.gpus?.[gpu]?.usage_percent,
              },
            ]}
          />
          <Chart
            samples={samples}
            max={120}
            unit=" °C"
            label="Temperaturas reportadas nos últimos dois minutos"
            series={[
              { name: "Sensor mais quente", color: "#dc9ca4", get: hottest },
              {
                name: "GPU",
                color: "#d2aa75",
                get: (s) => s.gpus?.[gpu]?.temperature_c,
              },
            ]}
          />
          <Chart
            samples={samples}
            max={Math.ceil(trafficMax)}
            unit=" Mbps"
            label="Tráfego recebido e enviado nos últimos dois minutos"
            series={[
              {
                name: "Recebido",
                color: "#77c9ad",
                get: (s) => s.network_receive_mbps,
              },
              {
                name: "Enviado",
                color: "#9bacdf",
                get: (s) => s.network_transmit_mbps,
              },
            ]}
          />
        </div>
      </section>
      <section className="panel">
        <h2>GPU e sensores</h2>
        {gpus.length > 1 && (
          <label className="field">
            GPU do gráfico
            <select
              value={gpu}
              onChange={(e) => setGpu(Number(e.target.value))}
            >
              {gpus.map((g, i) => (
                <option key={i} value={i}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="telemetry-grid">
          {gpus.map((g, i) => (
            <div className="telemetry-device" key={g.name + i}>
              <h3>{g.name}</h3>
              <p className="muted">Fonte: {g.source}</p>
              <dl>
                <div>
                  <dt>Uso</dt>
                  <dd>{value(g.usage_percent, "%")}</dd>
                </div>
                <div>
                  <dt>Temperatura</dt>
                  <dd>{value(g.temperature_c, " °C")}</dd>
                </div>
                <div>
                  <dt>VRAM utilizada / total</dt>
                  <dd>
                    {value(g.memory_used_mb, " MB", 0)} /{" "}
                    {value(g.memory_total_mb, " MB", 0)}
                  </dd>
                </div>
                <div>
                  <dt>Potência</dt>
                  <dd>{value(g.power_w, " W")}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
        {!gpus.length && (
          <p className="muted">
            Nenhuma leitura de GPU disponível. O app consulta NVIDIA NVSMI e
            contadores WDDM no Windows; disponibilidade depende do driver.
          </p>
        )}
        <div className="sensor-readings">
          {sensors.map((s, i) => (
            <div key={s.name + i}>
              <span>{s.name}</span>
              <strong>{value(s.temperature, " °C")}</strong>
            </div>
          ))}
        </div>
        {current?.warnings?.map((w) => (
          <p className="muted" key={w}>
            {w}
          </p>
        ))}
        <p className="muted">
          Temperatura de CPU/placa-mãe depende de sensores expostos pelo sistema
          ou pelo provedor WMI do LibreHardwareMonitor. Não estimamos
          temperaturas ausentes e não instalamos drivers de monitoramento.
        </p>
      </section>
      <section className="panel">
        <h2>Núcleos, memória e armazenamento</h2>
        <div className="telemetry-cores">
          {current?.per_core_usage?.map((usage, i) => (
            <label key={i}>
              <span>
                CPU {i + 1} · {value(usage, "%", 0)}
              </span>
              <meter
                min={0}
                max={100}
                value={usage}
                aria-label={"Uso da CPU lógica " + (i + 1)}
              />
            </label>
          ))}
        </div>
        <p className="muted">
          Memória virtual: {value(current?.swap_used_gb, " GB")} de{" "}
          {value(current?.swap_total_gb, " GB")}. Tempo ligado:{" "}
          {current
            ? value(Math.floor((current.uptime_seconds || 0) / 3600), " h", 0)
            : "—"}
          .
        </p>
        <div className="telemetry-table">
          <table>
            <thead>
              <tr>
                <th>Volume</th>
                <th>Livre / total</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {current?.disks?.map((d, i) => (
                <tr key={d.name + i}>
                  <td>
                    {d.name || "Volume " + (i + 1)} · {d.kind}
                  </td>
                  <td>
                    {value(d.available_gb, " GB")} / {value(d.total_gb, " GB")}
                  </td>
                  <td>
                    {d.total_gb > 0 && d.available_gb / d.total_gb < 0.1
                      ? "Menos de 10% livre"
                      : "Espaço disponível"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">
          Tráfego soma interfaces locais e pode incluir VPNs/loopback; não mede
          a velocidade contratada da internet. Dados desta tela ficam no
          dispositivo.
        </p>
      </section>
    </div>
  );
}
