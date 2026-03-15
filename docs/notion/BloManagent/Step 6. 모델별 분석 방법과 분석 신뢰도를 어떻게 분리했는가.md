# Step 6. 모델별 분석 방법과 분석 신뢰도를 어떻게 분리했는가

## SEO 패키지

- SEO 제목: algorithm, OpenAI, Google, Ollama를 어떻게 나누고 분석 신뢰도를 어떻게 정의했는가
- 슬러그: `analysis-engine-methods-and-reliability`
- 메타 설명: BloManagent에서 algorithm, OpenAI, Google, Ollama가 각각 어떤 역할을 맡고 있으며, 점수 신뢰도와 서술 신뢰도를 어떻게 분리해서 다루는지 정리합니다.
- 핵심 키워드: 분석 엔진 비교, algorithm 신뢰도, Ollama OpenAI Google 차이
- 보조 키워드: qualityScore 신뢰도, AI 보조 분석, 로컬 LLM 활용
- 추천 태그: `Algorithm`, `OpenAI`, `Google`, `Ollama`, `Reliability`

## 도입

분석 도구를 만들다 보면 가장 자주 받는 질문은 이것입니다. “어떤 모델이 제일 정확합니까?”

하지만 BloManagent에서는 이 질문을 그대로 받지 않았습니다. 대신 분석을 두 층으로 나눴습니다.

- 등급과 내부 점수는 누가 계산하는가
- 요약과 설명 문장은 누가 보강하는가

이 분리를 하지 않으면 점수 자체가 모델 기분에 따라 흔들리고 사용자는 결과를 신뢰하기 어려워집니다.
그래서 Step 6에서는 algorithm, OpenAI, Google, Ollama의 역할과 신뢰도 기준을 정리합니다.

## 블로그 게시용 HTML 구조 예시

```html
<article>
  <header>
    <h1>algorithm, OpenAI, Google, Ollama를 어떻게 나누고 분석 신뢰도를 어떻게 정의했는가</h1>
    <p>점수 계산과 서술 보강을 분리한 이유와 모델별 사용 기준을 정리합니다.</p>
  </header>
  <section id="method">
    <h2>모델별 역할</h2>
  </section>
  <section id="trust">
    <h2>신뢰도 기준</h2>
  </section>
  <section id="guide">
    <h2>실전 선택 가이드</h2>
  </section>
  <footer>시리즈 마무리</footer>
</article>
```

## BloManagent는 왜 점수와 서술을 분리했나

콘텐츠 분석에서 가장 위험한 상태는 숫자와 문장이 한꺼번에 모델에 종속되는 경우입니다. 같은 글이라도 모델과 프롬프트 편차에 따라 점수가 흔들릴 수 있습니다.

BloManagent는 이 문제를 피하기 위해 아래 원칙을 고정했습니다.

- 등급과 qualityScore는 항상 `algorithm`이 계산한다
- OpenAI, Google, Ollama는 `summary`, `strengths`, `weaknesses`, `improvements`, `seoNotes`만 보강한다
- AI 호출이 실패해도 분석 결과는 남는다

즉, 핵심 판정은 규칙 기반으로 두고 AI는 표현 보강에만 붙였습니다.

## 각 엔진은 실제로 어떤 일을 하나

### 1. algorithm

가장 중요한 엔진입니다. 제목, 훅, 문단 구조, 소제목, 목록, FAQ, 숫자 토큰, 예시 밀도, 중복 제목, 형제 글 겹침을 기반으로 qualityScore와 S~F 등급을 계산합니다. 같은 입력에는 같은 결과가 나옵니다.

### 2. OpenAI

서술 품질이 안정적인 편입니다. 개선 제안 문장을 다듬거나 한 줄 요약을 만들 때 유용합니다. 다만 API 키와 외부 네트워크가 필요합니다.

### 3. Google

빠른 요약과 포인트 정리에 강점이 있습니다. 점수 계산 자체는 맡기지 않습니다.

### 4. Ollama

로컬 환경에 가장 잘 맞습니다. 외부 API 없이 서술 보강을 하고 싶을 때 적합하지만, 품질과 속도는 올린 모델과 머신 사양 영향을 크게 받습니다.

## 신뢰도는 무엇을 기준으로 나눠야 하나

BloManagent에서는 신뢰도를 한 줄로 말하지 않고 아래처럼 층별로 봅니다.

### 점수 신뢰도: 높음

- verified post로 검증된 글일 것
- 제목과 본문 파싱이 정상일 것
- algorithm이 모든 신호를 계산할 수 있을 것

이 범위에서는 qualityScore와 S~F 등급을 높은 신뢰도로 볼 수 있습니다.

### 요약 문장 신뢰도: 중간

AI 엔진이 붙으면 문장 표현은 더 자연스러워질 수 있지만, 요약은 어디까지나 보조 층입니다. 문장 자체는 참고용으로 보는 편이 맞습니다.

### 플랫폼 메타데이터 신뢰도: 중간 이상

발행일, 제목, 본문, 공개 링크는 대체로 안정적이지만, 댓글 수나 공감 수 같은 참여 지표는 스킨과 공개 범위 영향을 받습니다. 값이 없으면 `null`로 둡니다.

## 어떤 상황에서 어떤 엔진을 쓰면 되나

- 빠르고 안정적인 기본 분석: `algorithm`
- 자연스러운 서술 보강이 필요할 때: `openai`
- 짧은 요약과 포인트 정리가 필요할 때: `google`
- 외부 API 없이 로컬에서 끝내고 싶을 때: `ollama`

핵심은 어떤 엔진을 골라도 등급 자체는 바뀌지 않는다는 점입니다. 이렇게 해야 모델 선택이 해석 편차가 아니라 표현 선택이 됩니다.

## 분석 신뢰도를 높이려면 무엇을 먼저 봐야 하나

1. 수집 글 수가 verified post 기준으로 맞는가
2. 제목과 본문 파싱이 정상인가
3. 같은 블로그에서 반복 제목과 구조적 병목이 실제로 드러나는가

이 세 가지가 맞지 않으면 더 좋은 모델을 붙여도 결과 신뢰도는 올라가지 않습니다. 신뢰도는 모델 이름보다 데이터 정합성과 검증 파이프라인에서 먼저 결정됩니다.

## 마무리

Step 6의 결론은 단순합니다. BloManagent에서 가장 믿어야 할 것은 모델명이 아니라 구조입니다.
verified post 수집, 설명 가능한 algorithm 점수, AI의 제한된 보강 역할이라는 세 층을 지켜야 결과가 흔들리지 않습니다.

## 내부 링크 추천

- 이전 글: Step 5. 티스토리 sitemap 오탐을 막는 strict verified-post discovery
- 시리즈 허브: BloManagent 관련 글 아카이브
