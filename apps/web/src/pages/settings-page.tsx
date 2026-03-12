import { useEffect, useState } from "react";
import type { SettingsPayload } from "@blog-review/shared";
import { api } from "../api";

export function SettingsPage() {
  const [data, setData] = useState<any>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.getSettings().then(setData);
  }, []);

  if (!data) return <div className="panel">불러오는 중...</div>;

  const onSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload: SettingsPayload = {
      providers: data.providers,
      app: data.app,
      secrets: data.secrets,
    };
    const result = await api.saveSettings(payload);
    setData(result);
    setMessage("설정이 저장되었습니다.");
  };

  return (
    <form className="page" onSubmit={onSave}>
      <section className="grid two">
        <div className="panel form-panel">
          <div className="section-header">
            <h3>AI 설정</h3>
          </div>
          {data.providers.map((provider: any, index: number) => (
            <div className="provider-block" key={provider.provider}>
              <h4>{provider.provider}</h4>
              <label>
                모델
                <input
                  value={provider.model}
                  onChange={(event) => {
                    const providers = [...data.providers];
                    providers[index] = { ...provider, model: event.target.value };
                    setData({ ...data, providers });
                  }}
                />
              </label>
              <label>
                기본 제공자
                <input
                  checked={provider.isDefault}
                  type="checkbox"
                  onChange={(event) => {
                    const providers = data.providers.map((item: any) => ({
                      ...item,
                      isDefault: item.provider === provider.provider ? event.target.checked : false,
                    }));
                    setData({ ...data, providers });
                  }}
                />
              </label>
              <label>
                최대 포스트 수
                <input
                  type="number"
                  value={provider.maxPostsPerRun}
                  onChange={(event) => {
                    const providers = [...data.providers];
                    providers[index] = { ...provider, maxPostsPerRun: Number(event.target.value) };
                    setData({ ...data, providers });
                  }}
                />
              </label>
            </div>
          ))}
        </div>

        <div className="panel form-panel">
          <div className="section-header">
            <h3>자격 증명 / 예산</h3>
          </div>
          <label>
            Google API Key
            <input
              type="password"
              onChange={(event) => setData({ ...data, secrets: { ...(data.secrets ?? {}), googleApiKey: event.target.value } })}
              placeholder={data.secretStatus.googleApiKey ? "저장됨" : "입력"}
            />
          </label>
          <label>
            OpenAI API Key
            <input
              type="password"
              onChange={(event) => setData({ ...data, secrets: { ...(data.secrets ?? {}), openaiApiKey: event.target.value } })}
              placeholder={data.secretStatus.openaiApiKey ? "저장됨" : "입력"}
            />
          </label>
          <label>
            Ollama Base URL
            <input
              value={data.secrets?.ollamaBaseUrl ?? data.providers.find((item: any) => item.provider === "ollama")?.ollamaBaseUrl ?? ""}
              onChange={(event) => setData({ ...data, secrets: { ...(data.secrets ?? {}), ollamaBaseUrl: event.target.value } })}
            />
          </label>
          <label>
            월 예산
            <input
              type="number"
              value={data.app.monthlyBudgetLimit}
              onChange={(event) => setData({ ...data, app: { ...data.app, monthlyBudgetLimit: Number(event.target.value) } })}
            />
          </label>
          <label>
            런당 최대 추정 비용
            <input
              type="number"
              step="0.1"
              value={data.app.maxEstimatedCostPerRun}
              onChange={(event) => setData({ ...data, app: { ...data.app, maxEstimatedCostPerRun: Number(event.target.value) } })}
            />
          </label>
          <p className="muted">
            비밀 저장소: {data.secretStatus.mode === "os-keychain" ? "OS Keychain" : "환경 변수 fallback"}
          </p>
          <button className="primary-button" type="submit">
            저장
          </button>
          {message ? <p className="muted">{message}</p> : null}
        </div>
      </section>
    </form>
  );
}
