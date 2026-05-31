import type { ExtractionPayload } from "./types";

const MAX_CHECKLIST_ITEMS = 10;

type Rule = {
  match: RegExp;
  items: string[];
};

const rules: Rule[] = [
  {
    match: /회의|미팅|세미나|컨퍼런스|워크숍|워크샵/,
    items: ["회의 안건 메모", "필기구", "자료 확인", "노트북"]
  },
  {
    match: /발표|발제|피칭|데모|시연/,
    items: ["발표자료 최종본", "노트북 충전기", "HDMI/어댑터", "리허설 메모"]
  },
  {
    match: /면접|인터뷰|채용/,
    items: ["신분증", "이력서/포트폴리오", "면접 장소 확인", "질문 메모"]
  },
  {
    match: /통화|전화|콜|줌|zoom|구글\s*밋|meet|화상/,
    items: ["이어폰", "통화 안건 메모", "조용한 장소 확인"]
  },
  {
    match: /야외|밖에서|공원|한강|피크닉|산책|축제|페스티벌|운동장|바다|해변|해수욕장|캠퍼스\s*밖/,
    items: ["썬크림", "물", "날씨 확인", "모자 또는 선글라스"]
  },
  {
    match: /등산|산행|트레킹|캠핑|글램핑/,
    items: ["등산화/편한 신발", "물", "간식", "여벌 양말"]
  },
  {
    match: /운동|헬스|러닝|조깅|테니스|축구|야구|농구|수영|골프|자전거/,
    items: ["운동복", "운동화", "수건", "물"]
  },
  {
    match: /점심|저녁|식사|밥|카페|식당|레스토랑|술|회식/,
    items: ["예약 확인", "참석 인원 확인", "결제수단"]
  },
  {
    match: /여행|공항|비행기|기차|버스|숙소|호텔|출장/,
    items: ["신분증", "예약/티켓 확인", "충전기", "보조배터리"]
  },
  {
    match: /병원|진료|검진|치과|약국/,
    items: ["신분증", "진료카드/보험 정보", "복용약 메모"]
  },
  {
    match: /수업|강의|스터디|과제|학교|랩실|연구실/,
    items: ["교재/자료", "필기구", "노트북"]
  },
  {
    match: /촬영|사진|영상|녹화|녹음/,
    items: ["배터리 충전", "저장공간 확인", "삼각대/마이크 확인"]
  },
  {
    match: /비|우천|장마|눈|폭설/,
    items: ["우산", "방수되는 가방"]
  },
  {
    match: /춥|추운|한파|겨울/,
    items: ["겉옷", "핫팩"]
  },
  {
    match: /덥|더운|폭염|여름/,
    items: ["물", "썬크림"]
  }
];

const explicitRules: Rule[] = [
  { match: /노트북|맥북|컴퓨터/, items: ["노트북"] },
  { match: /충전기|배터리/, items: ["충전기"] },
  { match: /자료|문서|파일|프린트|출력/, items: ["자료 확인"] },
  { match: /명함/, items: ["명함"] },
  { match: /신분증|여권|학생증/, items: ["신분증"] },
  { match: /녹음|통화/, items: ["통화 내용 확인"] },
  { match: /장소|위치|에서/, items: ["장소 확인"] }
];

export function enrichChecklist(payload: ExtractionPayload, sourceText: string) {
  const context = buildContext(payload, sourceText);
  const checklist = recommendChecklist(context, payload.checklist);

  return {
    ...payload,
    checklist
  };
}

export function recommendChecklist(sourceText: string, existing: string[] = []) {
  const items: string[] = [];
  for (const item of existing) addUnique(items, item);

  for (const rule of explicitRules) {
    if (rule.match.test(sourceText)) {
      for (const item of rule.items) addUnique(items, item);
    }
  }

  for (const rule of rules) {
    if (rule.match.test(sourceText)) {
      for (const item of rule.items) addUnique(items, item);
    }
  }

  return items.slice(0, MAX_CHECKLIST_ITEMS);
}

function buildContext(payload: ExtractionPayload, sourceText: string) {
  return [
    sourceText,
    payload.title,
    payload.raw_summary,
    ...payload.events.map((event) =>
      [event.title, event.location, event.description].filter(Boolean).join(" ")
    ),
    ...payload.todos.map((todo) => todo.text),
    ...payload.suggestions.map((suggestion) => suggestion.message)
  ].join("\n");
}

function addUnique(items: string[], item: string) {
  const trimmed = item.trim();
  if (!trimmed) return;
  const normalized = trimmed.replace(/\s+/g, "").toLowerCase();
  const exists = items.some((value) => value.replace(/\s+/g, "").toLowerCase() === normalized);
  if (!exists) items.push(trimmed);
}
