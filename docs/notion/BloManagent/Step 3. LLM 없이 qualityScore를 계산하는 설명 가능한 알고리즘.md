# Step 3. LLM 없이 qualityScore를 계산하는 설명 가능한 알고리즘

## SEO 패키지

- SEO 제목: LLM 없이 qualityScore를 계산하는 설명 가능한 블로그 분석 알고리즘
- 슬러그: `explainable-qualityscore-blog-analysis-algorithm`
- 메타 설명: BloManagent가 왜 EBI를 버리고 게시글별 qualityScore를 선택했는지, 그리고 LLM 없이도 설명 가능한 점수와 개선 제안을 계산하는 구조를 정리합니다.
- 핵심 키워드: qualityScore 알고리즘, 설명 가능한 블로그 분석, LLM 없는 콘텐츠 평가
- 보조 키워드: 규칙 기반 글 분석, 게시글 점수 계산, 블로그 품질 평가
- 추천 태그: `Algorithm`, `qualityScore`, `콘텐츠분석`, `LLM`, `규칙기반`

## 도입

처음에는 종합 지표를 하나 두고 싶었습니다.  
하지만 실제로 화면을 만들고 데이터를 붙여보니, 블로그 전체를 하나의 숫자로 표현하는 방식은 액션과 연결되기 어려웠습니다.

운영자에게 필요한 것은 “이 블로그는 71점입니다”가 아니라 아래 정보였습니다.

- 이 글은 왜 54점인가
- 어떤 항목이 약한가
- 무엇을 고치면 바로 좋아지는가

그래서 BloManagent는 종합 지표 중심 구조를 버리고, 게시글별 `qualityScore`를 중심으로 재설계했습니다.

## 이 글에서 다루는 내용

1. 왜 EBI 같은 종합 지표를 제거했는가
2. qualityScore를 어떤 항목으로 쪼갰는가
3. LLM 없이도 점수를 계산할 수 있게 한 이유
4. 개선 제안을 어떻게 규칙 기반으로 만들었는가

## 왜 종합 지표를 버렸나

종합 지표는 한눈에 보기에는 좋습니다. 하지만 문제를 숨기기 쉽습니다.

예를 들어 평균은 괜찮아 보여도 실제로는 아래 같은 상황이 있을 수 있습니다.

- 제목은 강하지만 정보 밀도가 낮은 글
- 검색 의도는 맞지만 차별점이 약한 글
- 구조는 좋은데 실행 가능성이 떨어지는 글

이런 경우 블로그 평균은 별로 도움이 되지 않습니다.  
운영자는 결국 글 하나하나를 수정해야 하기 때문입니다.

그래서 BloManagent는 “대표 숫자 하나”보다 “설명 가능한 구성 점수 다섯 개”를 먼저 보여주는 방식을 선택했습니다.

## qualityScore는 어떻게 계산하나

현재 점수 모델은 아래 다섯 축으로 고정되어 있습니다.

### 1. `headlineScore`

- `titleStrength`
- `hookStrength`

제목이 분명한지, 첫 문단이 독자를 붙잡는지 평가합니다.

### 2. `readabilityScore`

- `structureScore`

소제목, 문단 길이, 흐름 전개 등 읽기 편한 구조를 반영합니다.

### 3. `valueScore`

- `informationDensityScore`
- `practicalityScore`

정보의 밀도와 실행 가능성을 함께 봅니다.

### 4. `originalityScore`

- `differentiationScore`

차별점, 관점, 경험 기반 설명이 살아 있는지 평가합니다.

### 5. `searchFitScore`

- `seoPotentialScore`
- `audienceFitScore`

검색 의도와 잠재 독자 적합도를 반영합니다.

최종 점수는 아래처럼 계산합니다.

```txt
headlineScore = avg(titleStrength, hookStrength)
readabilityScore = structureScore
valueScore = avg(informationDensityScore, practicalityScore)
originalityScore = differentiationScore
searchFitScore = avg(seoPotentialScore, audienceFitScore)
qualityScore = round(avg(headlineScore, readabilityScore, valueScore, originalityScore, searchFitScore))
```

## 왜 LLM 없이도 돌아가게 했나

많은 도구가 AI를 켜야만 분석이 됩니다. 하지만 이 프로젝트는 반대로 갔습니다.

### 이유 1. 기본 기능이 API 키에 묶이면 진입 장벽이 커진다

오픈소스 워크스페이스라면 설치 후 바로 동작해야 합니다.

### 이유 2. 점수는 설명 가능해야 한다

LLM 기반 평가는 유연하지만, 왜 그 숫자가 나왔는지 설명이 약해질 수 있습니다.  
qualityScore는 반드시 규칙과 항목으로 분해 가능해야 했습니다.

### 이유 3. 실패해도 제품 전체가 멈추면 안 된다

LLM 호출은 실패할 수 있습니다.  
하지만 점수 계산과 우선순위 추천은 계속 돌아가야 했습니다.

그래서 BloManagent의 기본 원칙은 아래와 같습니다.

- 점수는 항상 algorithm이 계산한다
- AI는 켜더라도 요약 문장 보강에만 쓴다
- AI가 실패해도 분석 결과는 남는다

## 개선 제안은 어떻게 만들었나

점수만 보여주면 사용자는 다시 고민해야 합니다.  
그래서 약한 항목별로 바로 행동할 수 있는 개선 제안을 함께 생성합니다.

예를 들면 다음과 같습니다.

- `headlineScore < 60`: 제목 선명도, 첫 문단 훅 보강
- `readabilityScore < 60`: 소제목 추가, 문단 분리, 목록화
- `valueScore < 60`: 예시, 체크리스트, 단계형 설명 보강
- `originalityScore < 60`: 비교 관점, 경험, 차별 포인트 추가
- `searchFitScore < 60`: 검색 의도 정렬, 질문형 소제목, FAQ 보강

이렇게 하면 점수가 바로 액션으로 이어집니다.

## 구현하면서 얻은 장점

qualityScore 구조로 바꾸고 나서 좋은 점이 많았습니다.

- 대시보드에서 낮은 점수 글을 바로 정렬할 수 있다
- 반복 이슈를 글 단위로 쉽게 모을 수 있다
- AI를 켜더라도 점수 일관성이 유지된다
- 테스트가 쉬워진다

무엇보다 “왜 이 점수인지”를 설명할 수 있게 된 것이 가장 큰 변화였습니다.

## 마무리

Step 3의 핵심은 AI를 더 많이 붙이는 것이 아니라, AI 없이도 제품이 충분히 설득력 있게 돌아가게 만드는 것이었습니다.  
qualityScore는 그 결과물입니다.

다음 글에서는 이 점수와 개선 포인트를 실제 사용자 경험으로 연결하기 위해, 대시보드와 GitHub Pages 문서를 어떤 톤으로 재구성했는지 정리하겠습니다.

## 내부 링크 추천

- 이전 글: Step 2. SQLite와 공개 피드 기반 블로그 수집기 설계
- 다음 글: Step 4. 대시보드와 GitHub Pages 문서를 제품처럼 다듬는 과정
