import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { SettingsPayload } from "@blog-review/shared";
import { api } from "../api";

export function SettingsPage() {
  const [data, setData] = useState<any>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.getSettings().then(setData);
  }, []);

  const algorithmConfig = useMemo(
    () => data?.providers?.find((item: any) => item.engine === "algorithm") ?? null,
    [data],
  );

  const aiProviders = useMemo(
    () => data?.providers?.filter((item: any) => item.engine !== "algorithm") ?? [],
    [data],
  );

  if (!data) return <div className="panel">설정 데이터를 불러오는 중입니다.</div>;

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    const payload: SettingsPayload = {
      providers: data.providers,
      app: data.app,
      secrets: data.secrets,
    };
    const result = await api.saveSettings(payload);
    setData(result);
    setMessage("설정을 저장했습니다.");
  };

  return (
    <form className="page" onSubmit={onSave}>
      <section className="hero dashboard-hero">
        <div>
          <p className="eyebrow">Engine Settings</p>
          <h2>기본 알고리즘과 선택형 AI 보강 엔진을 함께 조정하는 설정 패널</h2>
          <p className="muted">
            점수와 등급은 algorithm이 계산합니다. OpenAI, Google, Ollama는 필요할 때만 서술 보강용으로 붙일 수 있습니다.
          </p>
        </div>

        <div className="hero-stats dashboard-stats">
          <div className="metric-card">
            <span>기본 엔진</span>
            <strong>{algorithmConfig?.engine ?? "algorithm"}</strong>
          </div>
          <div className="metric-card">
            <span>기본 모델</span>
            <strong>{algorithmConfig?.model ?? "-"}</strong>
          </div>
          <div className="metric-card">
            <span>AI 보강 엔진</span>
            <strong>{aiProviders.length}</strong>
          </div>
          <div className="metric-card">
            <span>네이버 수집</span>
            <strong>{data.app.allowNaverPublicCrawl ? "허용" : "차단"}</strong>
          </div>
        </div>
      </section>

      <section className="grid two">
        <div className="panel form-panel">
          <div className="section-header">
            <h3>기본 분석 설정</h3>
          </div>

          <label>
            기본 분석 범위
            <select
              value={data.app.analysisRangeDefault}
              onChange={(event) => setData({ ...data, app: { ...data.app, analysisRangeDefault: event.target.value } })}
            >
              <option value="latest7">최근 7개</option>
              <option value="latest30">최근 30개</option>
              <option value="newOnly">새 글 또는 변경 글만</option>
              <option value="full">가능한 전체</option>
            </select>
          </label>

          <label>
            수집 깊이
            <input
              type="number"
              value={data.app.discoveryDepth}
              onChange={(event) => setData({ ...data, app: { ...data.app, discoveryDepth: Number(event.target.value) } })}
            />
          </label>

          <label className="checkbox-row">
            <span>참여 지표 스냅샷 수집</span>
            <input
              checked={data.app.collectEngagementSnapshots}
              type="checkbox"
              onChange={(event) =>
                setData({ ...data, app: { ...data.app, collectEngagementSnapshots: event.target.checked } })
              }
            />
          </label>

          <label className="checkbox-row">
            <span>네이버 공개 수집 허용</span>
            <input
              checked={data.app.allowNaverPublicCrawl}
              type="checkbox"
              onChange={(event) =>
                setData({ ...data, app: { ...data.app, allowNaverPublicCrawl: event.target.checked } })
              }
            />
          </label>

          <div className="advanced-panel">
            <strong>기본 운영 원칙</strong>
            <p className="muted">
              알고리즘이 등급을 계산하고, 선택한 범위 전체 게시글을 기본으로 분석합니다. 네이버는 정책 리스크 때문에 기본 비활성화
              상태를 권장합니다.
            </p>
          </div>
        </div>

        <div className="panel form-panel">
          <div className="section-header">
            <h3>예산 및 보강 정책</h3>
          </div>

          <label>
            월 예산 한도
            <input
              type="number"
              value={data.app.monthlyBudgetLimit}
              onChange={(event) => setData({ ...data, app: { ...data.app, monthlyBudgetLimit: Number(event.target.value) } })}
            />
          </label>

          <label>
            1회 최대 예상 비용
            <input
              type="number"
              step="0.1"
              value={data.app.maxEstimatedCostPerRun}
              onChange={(event) =>
                setData({ ...data, app: { ...data.app, maxEstimatedCostPerRun: Number(event.target.value) } })
              }
            />
          </label>

          <p className="muted">
            점수는 algorithm이 고정 계산합니다. 아래 AI 엔진은 요약 문장과 표현 보강 용도로만 사용됩니다.
          </p>

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
              value={
                data.secrets?.ollamaBaseUrl ??
                aiProviders.find((item: any) => item.engine === "ollama")?.ollamaBaseUrl ??
                ""
              }
              onChange={(event) => setData({ ...data, secrets: { ...(data.secrets ?? {}), ollamaBaseUrl: event.target.value } })}
              placeholder="http://127.0.0.1:11434"
            />
          </label>

          <p className="muted">
            비밀 저장소: {data.secretStatus.mode === "os-keychain" ? "OS Keychain" : "환경 변수 fallback"}
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="section-header">
          <h3>선택형 AI 엔진 세부 설정</h3>
        </div>

        <div className="card-list">
          {aiProviders.map((provider: any) => (
            <article className="provider-block" key={provider.engine}>
              <div className="section-split">
                <strong>{provider.engine}</strong>
                <span className={`status-pill ${provider.hasCredential ? "good" : "neutral"}`}>
                  {provider.hasCredential ? "연결 가능" : "미설정"}
                </span>
              </div>

              <label>
                모델
                <input
                  value={provider.model}
                  onChange={(event) => {
                    const providers = [...data.providers];
                    const targetIndex = data.providers.findIndex((item: any) => item.engine === provider.engine);
                    providers[targetIndex] = { ...provider, model: event.target.value };
                    setData({ ...data, providers });
                  }}
                />
              </label>

              <label>
                글당 최대 게시글 수
                <input
                  type="number"
                  value={provider.maxPostsPerRun}
                  onChange={(event) => {
                    const providers = [...data.providers];
                    const targetIndex = data.providers.findIndex((item: any) => item.engine === provider.engine);
                    providers[targetIndex] = { ...provider, maxPostsPerRun: Number(event.target.value) };
                    setData({ ...data, providers });
                  }}
                />
              </label>

              <label>
                글당 최대 문자 수
                <input
                  type="number"
                  value={provider.maxCharsPerPost}
                  onChange={(event) => {
                    const providers = [...data.providers];
                    const targetIndex = data.providers.findIndex((item: any) => item.engine === provider.engine);
                    providers[targetIndex] = { ...provider, maxCharsPerPost: Number(event.target.value) };
                    setData({ ...data, providers });
                  }}
                />
              </label>

              <label>
                최대 출력 토큰
                <input
                  type="number"
                  value={provider.maxOutputTokens}
                  onChange={(event) => {
                    const providers = [...data.providers];
                    const targetIndex = data.providers.findIndex((item: any) => item.engine === provider.engine);
                    providers[targetIndex] = { ...provider, maxOutputTokens: Number(event.target.value) };
                    setData({ ...data, providers });
                  }}
                />
              </label>

              <p className="muted">fallback: {provider.fallbackEngine ?? "algorithm"}</p>
            </article>
          ))}
        </div>
      </section>

      <button className="primary-button" type="submit">
        설정 저장
      </button>
      {message ? <p className="muted">{message}</p> : null}
    </form>
  );
}
