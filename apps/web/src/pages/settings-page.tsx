import { useEffect, useMemo, useState } from "react";
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

  if (!data) return <div className="panel">설정을 불러오는 중입니다.</div>;

  const onSave = async (event: React.FormEvent) => {
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
              <option value="latest7">최근 7일</option>
              <option value="latest30">최근 30일</option>
              <option value="newOnly">새 글 또는 변경 글만</option>
              <option value="full">가능한 전체</option>
            </select>
          </label>

          <label>
            Discovery depth
            <input
              type="number"
              value={data.app.discoveryDepth}
              onChange={(event) => setData({ ...data, app: { ...data.app, discoveryDepth: Number(event.target.value) } })}
            />
          </label>

          <label className="checkbox-row">
            <span>참여 지표 스냅샷 저장</span>
            <input
              checked={data.app.collectEngagementSnapshots}
              type="checkbox"
              onChange={(event) =>
                setData({ ...data, app: { ...data.app, collectEngagementSnapshots: event.target.checked } })
              }
            />
          </label>

          <label className="checkbox-row">
            <span>Naver 공개 수집 허용</span>
            <input
              checked={data.app.allowNaverPublicCrawl}
              type="checkbox"
              onChange={(event) =>
                setData({ ...data, app: { ...data.app, allowNaverPublicCrawl: event.target.checked } })
              }
            />
          </label>

          <p className="muted">
            네이버는 정책 리스크가 있어 기본값을 끈 상태로 두었습니다. 켜기 전에 도움말의 주의사항을 먼저 확인해 주세요.
          </p>

          <div className="advanced-panel">
            <strong>기본 엔진</strong>
            <p className="muted">
              {algorithmConfig
                ? `algorithm / ${algorithmConfig.model} / 글당 최대 ${algorithmConfig.maxPostsPerRun}개`
                : "algorithm 엔진 설정이 없습니다."}
            </p>
          </div>
        </div>

        <div className="panel form-panel">
          <div className="section-header">
            <h3>예산과 AI 보강</h3>
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
            점수는 algorithm이 계산하고, 아래 AI 엔진은 요약 문장 보강 용도로만 사용됩니다.
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
            />
          </label>

          <p className="muted">
            비밀 저장소: {data.secretStatus.mode === "os-keychain" ? "OS Keychain" : "환경 변수 fallback"}
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="section-header">
          <h3>고급 AI 엔진 설정</h3>
        </div>

        <div className="card-list">
          {aiProviders.map((provider: any) => (
            <article className="provider-block" key={provider.engine}>
              <h4>{provider.engine}</h4>

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

              <p className="muted">
                credential: {provider.hasCredential ? "configured" : "not configured"} / fallback: {provider.fallbackEngine ?? "algorithm"}
              </p>
            </article>
          ))}
        </div>
      </section>

      <button className="primary-button" type="submit">
        저장
      </button>
      {message ? <p className="muted">{message}</p> : null}
    </form>
  );
}
