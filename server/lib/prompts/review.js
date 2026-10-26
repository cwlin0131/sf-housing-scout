/**
 * The review prompt, in each language the interface speaks.
 *
 * One brief builder, two label sets. Duplicating the builder per language would let the
 * two drift, and the brief is the factual half: what changes between languages is only
 * what the labels are called and how the model is asked to write.
 *
 * The length rules are calibrated separately per language and are not translations of
 * each other. A Chinese character carries roughly twice what a Latin one does, so the
 * character budget that produced good Chinese prose produces telegrams in English.
 *
 * Both carry a floor as well as a ceiling. A ceiling alone says where to stop but not
 * where to start, and the model collapsed into clipped fragments to stay under it; the
 * floor is what restored sentences that sound like a person talking.
 */

export const LANGS = ['en', 'zh'];
export const pickLang = (raw) => (LANGS.includes(String(raw).slice(0, 2)) ? String(raw).slice(0, 2) : 'en');

const LABELS = {
  en: {
    address: 'Address', neighborhood: 'District', place: 'Common name for this spot', area: (tier) => `Area read (hand written, tier ${tier}/5)`,
    unit: 'Unit', rent: 'Rent', perSqft: (v) => ` ($${v} per sqft)`, fees: (v) => ` plus $${v} in fees`,
    refLine: (max, over, head) =>
      `. Their reference line is $${max}, ${over ? 'this one is above it' : `$${head} below it`}`,
    safety: (r, n, pct, pr, prr, st, str) =>
      `Safety (within ${r}m, last 12 months): ${n} personal-safety incidents, `
      + `quieter than ${pct}% of San Francisco. ${pr} property incidents (within ${prr}m). `
      + `${st} street-condition reports (within ${str}m, last 6 months).`,
    topCats: 'Most common personal-safety categories',
    trend: (dir, pct) => `Trend: last three months ${dir === 'worsening' ? 'up' : 'down'} ${pct}% on the three before`,
    capped: (name) => `Note: the user has ruled this area out themselves (${name}), so the score is capped`,
    noIncidents: 'Safety: incident data not synced, only the area read is available',
    muni: (name, min, m) => `Nearest Muni Metro: ${name}, about a ${min} minute walk (${m}m)`,
    bart: (name, min, m) => `Nearest BART: ${name}, about a ${min} minute walk (${m}m)`,
    lines: (n) => `${n} distinct rail lines reachable within an 800m walk`,
    amenities: (list) => `Everyday amenities within an 800m walk: ${list || 'almost nothing'}`,
    nearest: 'Nearest of each',
    nearestItem: (label, min) => `${label} ${min} min`,
    amenityLabel: { supermarket: 'groceries', cafe: 'cafes', restaurant: 'restaurants', gym: 'gyms', pharmacy: 'pharmacies', laundry: 'laundry' },
    countItem: (label, n) => `${n} ${label}`,
    terrain: (m, note) => `Terrain: ${m}m of climb from here to the nearest station (${note})`,
    terrainNote: { flat: 'essentially flat', some_climb: 'a bit of a climb', steep: 'a real hill' },
    anchors: 'Walking time to the places they go',
    anchorItem: (name, min) => `${name} ${min} min`,
    scores: (s, c, p) => `Scores this tool computed: safety ${s}, convenience ${c}, price ${p ?? 'n/a'} (out of 100 each)`,
    ask: 'What is this block like?',
  },
  zh: {
    address: '地址', neighborhood: '行政區', place: '這個位置的常用地名', area: (tier) => `區域概況（人工整理，tier ${tier}/5）`,
    unit: '房型', rent: '租金', perSqft: (v) => `（每平方英尺 $${v}）`, fees: (v) => ` + 月費 $${v}`,
    refLine: (max, over, head) => `。使用者參考線 $${max}，${over ? '這間超過' : `還有 $${head} 空間`}`,
    safety: (r, n, pct, pr, prr, st, str) =>
      `治安（半徑 ${r} 公尺、近 12 個月）：人身安全類 ${n} 件，`
      + `比全 SF ${pct}% 的地方安全。財產類 ${pr} 件（半徑 ${prr}）。`
      + `街道髒亂通報 ${st} 件（半徑 ${str}、近 6 個月）。`,
    topCats: '人身安全類最多的是',
    trend: (dir, pct) => `趨勢：近三個月比前三個月${dir === 'worsening' ? '增加' : '減少'} ${pct}%`,
    capped: (name) => `注意：這裡屬於使用者自己標記的迴避區（${name}），分數已被壓到上限`,
    noIncidents: '治安：尚未同步事件資料，只有區域概況',
    muni: (name, min, m) => `最近的 Muni Metro：${name}，走路約 ${min} 分鐘（${m} 公尺）`,
    bart: (name, min, m) => `最近的 BART：${name}，走路約 ${min} 分鐘（${m} 公尺）`,
    lines: (n) => `步行 800 公尺內可搭到 ${n} 條不同軌道路線`,
    amenities: (list) => `生活機能（步行 800 公尺內）：${list || '幾乎沒有'}`,
    nearest: '最近距離',
    nearestItem: (label, min) => `${label}最近 ${min} 分鐘`,
    amenityLabel: { supermarket: '超市', cafe: '咖啡店', restaurant: '餐廳', gym: '健身房', pharmacy: '藥局', laundry: '洗衣' },
    countItem: (label, n) => `${label} ${n} 間`,
    terrain: (m, note) => `地形：從這裡走到最近車站要爬 ${m} 公尺（${note}）`,
    terrainNote: { flat: '基本平地', some_climb: '有點坡', steep: '回家是上坡，而且不算小' },
    anchors: '到常去地點',
    anchorItem: (name, min) => `${name} 走路 ${min} 分鐘`,
    scores: (s, c, p) => `本工具算出的分數：治安 ${s}／方便性 ${c}／價格 ${p ?? '無'}（各 100 分）`,
    ask: '這一帶怎麼樣？',
  },
};

export const SYSTEM = {
  en: `You are a friend who has lived in San Francisco for ten years. Someone has sent you a rental listing and asked what the area is like.

Answer in English, always as exactly three labelled lines:

Safety: (what this block actually feels like to walk at night)
Transit: (how long to a station, flat or hill)
Neighborhood: (how many places to eat and shop, how easy the everyday errands are)

Rules:
- **Each line is 110 to 135 characters including the label**, and the three together stay under 400. Both bounds are hard.
- Under 110 means you were vague, so add one concrete detail. Over 135 means cutting the least useful clause.
- Roughly two short sentences per line. It should read like someone talking, not like a telegram written to fit a limit.
- One subject per line, no repeating across lines.
- At least one of the three lines names a real tradeoff (quiet but dull, convenient but loud, cheap but uphill). Put it in the line it belongs to, never on a line of its own.
- Describe how the block feels, not the general reputation of the district.
- Do not restate the numbers, the reader has them. Converted phrasing like "a ten minute walk" is good; "103 personal-safety incidents" is not.
- Never invent a shop, street, building, or event that is not in the brief. Say you are not sure instead.
- No filler like "overall" or "worth considering".
- Punctuate with commas, colons, semicolons and full stops. Never an em dash or an en dash.
- No fourth line, no preamble, no sign-off. Stop after the third line.

Talk like a friend: direct, no pleasantries.`,

  zh: `你是一個在舊金山住了十年的朋友。使用者傳了一個租屋物件問你這一帶怎麼樣。

用繁體中文回答，格式固定為三行，每行開頭是標籤：

治安：（這個街廓晚上走起來的實際感覺）
交通：（走到車站多久、平地還是坡）
社區：（餐廳店家多不多、日常採買方不方便）

規則：
- **每一行 55 到 65 字（含標籤）**，三行加起來不超過 200 字。這是硬性限制，兩邊都要守。
- 不到 55 字代表你講得太籠統，補一個具體的細節；超過 65 字就砍掉最不重要的那個子句。
- 每行兩個短句左右。要像人在講話，不要為了壓字數寫成電報。
- 每行只講那一件事，不要跨行重複。
- 三行裡至少有一行要點出具體的取捨（安靜但冷清、方便但吵、便宜但要爬坡）。取捨寫在它所屬的那一行裡，不要另起一行。
- 講「街廓」的體感，不是行政區的籠統印象。
- 不要複述資料裡的數字，他自己看得到。可以講「走路十分鐘」這種換算過的說法，但不要說「人身安全類 103 件」。
- 不要編造資料裡沒有的店家、街名、建築或事件。不確定就直接說不確定。
- 不要寫「整體而言」「值得考慮」這種沒有資訊量的句子。
- 標點用逗號、冒號、分號、句號。不要用破折號。
- 不要有第四行，不要開場白，不要結語。三行講完就停。

語氣像朋友在講話，直接、不客套。`,
};

export const ask = (lang) => LABELS[lang].ask;

/** The facts, labelled in the reader's language. The model gets nothing it did not compute. */
export function buildBrief(listing, breakdown, lang, budget) {
  const T = LABELS[lang];
  const s = breakdown.safety;
  const c = breakdown.convenience;
  const p = breakdown.price;
  const L = [];
  // Full-width colon in Chinese. An ASCII one reads as foreign punctuation mid-sentence,
  // and the brief is the model's example of how to write in this language.
  const sep = lang === 'zh' ? '：' : ': ';
  const kv = (k, v) => L.push(`${k}${sep}${v}`);

  kv(T.address, listing.address);
  if (listing.neighborhood) kv(T.neighborhood, listing.neighborhood);
  if (s.place && s.place !== listing.neighborhood) kv(T.place, s.place);
  if (s.zone) kv(T.area(s.zone.tier), s.zone.summary?.[lang] ?? s.zone.summary?.en ?? s.zone.summary);

  const bits = [];
  if (listing.unit_type) bits.push(listing.unit_type);
  if (listing.beds != null) bits.push(`${listing.beds} bed`);
  if (listing.baths != null) bits.push(`${listing.baths} bath`);
  if (listing.sqft) bits.push(`${listing.sqft} sqft`);
  if (bits.length) kv(T.unit, bits.join(' / '));

  if (listing.price) {
    kv(T.rent,
      `$${listing.price}${listing.monthly_fees ? T.fees(listing.monthly_fees) : ''}`
      + (p.perSqft ? T.perSqft(p.perSqft) : '')
      + T.refLine(budget.max, p.overBudget, p.headroom));
  }

  if (s.basis === 'incidents') {
    const pc = s.parts.personal;
    const pr = s.parts.property;
    const st = s.parts.street;
    L.push(T.safety(pc.radius, pc.count, Math.round((1 - pc.percentile) * 100),
                    pr.count, pr.radius, st.count, st.radius));
    const cats = Object.entries(pc.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (cats.length) kv(T.topCats, cats.map(([k, v]) => `${k} ${v}`).join(', '));
    if (s.parts.trend.direction !== 'flat') {
      L.push(T.trend(s.parts.trend.direction, Math.abs(s.parts.trend.changePct)));
    }
    if (s.capped) L.push(T.capped(s.capped.name));
  } else {
    L.push(T.noIncidents);
  }

  const tr = c.parts.transit;
  if (tr?.muni_metro) L.push(T.muni(tr.muni_metro.name, Math.round(tr.muni_metro.minutes), tr.muni_metro.metres));
  if (tr?.bart) L.push(T.bart(tr.bart.name, Math.round(tr.bart.minutes), tr.bart.metres));
  if (tr?.linesWithin800) L.push(T.lines(tr.linesWithin800));

  const a = c.parts.amenities;
  if (a?.ok) {
    const counts = Object.entries(a.counts).filter(([, v]) => v > 0)
      .map(([k, v]) => T.countItem(T.amenityLabel[k], v)).join(', ');
    L.push(T.amenities(counts));
    const near = Object.entries(a.nearest).filter(([, v]) => v)
      .map(([k, v]) => T.nearestItem(T.amenityLabel[k], Math.round(v.metres / 80))).join(', ');
    if (near) kv(T.nearest, near);
  }

  const terr = c.parts.terrain;
  if (terr?.climbMetres != null) {
    L.push(T.terrain(terr.climbMetres, T.terrainNote[terr.note?.code] ?? terr.note?.code ?? ''));
  }

  const anch = c.parts.anchors?.detail || [];
  if (anch.length) kv(T.anchors, anch.map((x) => T.anchorItem(x.name, x.minutes)).join(', '));

  L.push(T.scores(s.score, c.score, p.score));
  return L.join('\n');
}
