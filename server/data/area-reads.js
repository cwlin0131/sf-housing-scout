/**
 * The curated area layer: a hand-assigned tier and a short written read for each of the
 * city's 41 analysis neighbourhoods, in both languages.
 *
 * Separate from build-zones.js because this is content, not code. Fixing a translation or
 * updating a read after a news cycle should not mean touching the script that draws the
 * polygons.
 *
 * The tiers are judgement, not arithmetic, and that is deliberate. A statistical surface
 * over incident counts is what the per-listing score already does; this layer answers the
 * different question a person asks first, which is what a part of town is like to live in.
 * Every tier traces to an entry in SOURCES, and a zone that cites nothing is a zone whose
 * tier should not be trusted.
 *
 * The two languages are not word-for-word. They carry the same claims and the same
 * sourcing; where an English sentence needs context a Chinese reader already has, or the
 * other way round, the sentence says so rather than translating around it.
 */

export const SOURCES = [
  {
    id: 'yc-housing-guide',
    url: null,
    date: '2026-08-14',
    label: { en: 'YC founder housing guidance', zh: 'YC 創業者住宿指引' },
    note: {
      en: 'Community guidance for founders: avoid Civic Center and the east Mission; treat SoMa west of 4th St differently from the Moscone side. Used here only to place the 4th St and Mission St split lines; tiers still trace to the reporting listed on each zone.',
      zh: '創業者社群的住宿指引：Civic Center 與 Mission 東側避開、SoMa 以 4th St 分兩側看。本檔只用它決定 4th St 與 Mission St 兩條切線的位置，tier 判定仍以各區列出的報導為準。',
    },
  },
  {
    id: 'sfpd-2025',
    url: 'https://www.sanfranciscopolice.org/news/san-francisco-has-lowest-homicide-rate-70-years-declines',
    date: '2026-01-02',
    label: { en: 'SFPD 2025 year end', zh: 'SFPD 2025 年終' },
    note: {
      en: '28 homicides in 2025, the lowest since 1954. Crime overall down 25%, violent down 18%, property down 27%. Assault went the other way, up 28.6%.',
      zh: '2025 年 28 起凶殺，1954 年以來最低。整體犯罪減 25%、暴力減 18%、財產減 27%。但傷害案逆勢增 28.6%',
    },
  },
  {
    id: 'standard-2025-stats',
    url: 'https://sfstandard.com/2026/01/02/san-francisco-2025-crime-stats/',
    date: '2026-01-02',
    label: { en: 'SF Standard 2025 annual figures', zh: 'SF Standard 2025 年度統計' },
    note: {
      en: 'Tenderloin station covers the smallest area yet stays high on homicide, robbery and assault. Ingleside station recorded the most homicides in the city in 2025.',
      zh: 'Tenderloin 分局面積最小但凶殺、搶劫、傷害持續高檔；Ingleside 分局 2025 年凶殺數全市最多',
    },
  },
  {
    id: 'chronicle-by-neighborhood',
    url: 'https://www.yahoo.com/news/articles/san-francisco-crime-rates-hit-120000383.html',
    date: '2026-01-14',
    label: { en: 'SF Chronicle neighbourhood crime analysis', zh: 'SF Chronicle 社區犯罪率分析' },
    note: {
      en: 'Only two neighbourhoods saw crime rise in 2025, SoMa and Mission Bay, and almost all of it was theft from two big-box stores. North Beach property crime fell by nearly half.',
      zh: '2025 年全市只有兩個社區犯罪上升：SoMa 與 Mission Bay，且幾乎全來自兩家大型量販店的竊盜。North Beach 財產犯罪反而減近 50%',
    },
  },
  {
    id: 'examiner-by-station',
    url: 'https://www.sfexaminer.com/news/crime/sf-crime-kept-falling-in-2025-but-the-drop-wasn-t-citywide/article_d693fc3c-dc14-42fb-9f8e-5ac8fa729a97.html',
    date: '2025-12-29',
    label: { en: 'SF Examiner 2025 by police station', zh: 'SF Examiner 分局別 2025' },
    note: {
      en: 'Southern station property crime up 22.6%, the only large station to worsen. Central down 38.7%, Ingleside down 42.2%.',
      zh: 'Southern 分局財產犯罪 +22.6%，是唯一惡化的大分局；Central -38.7%、Ingleside -42.2%',
    },
  },
  {
    id: 'ccj-midyear',
    url: 'https://counciloncj.org/crime-trends-in-u-s-cities-mid-year-2026-update/',
    date: '2026-07-23',
    label: { en: 'Council on Criminal Justice mid-year report', zh: 'Council on Criminal Justice 年中報告' },
    note: {
      en: 'San Francisco homicide rose in the first half of 2026, one of only 8 of 36 surveyed cities to rise. SFPD puts it at 12 to 16 cases.',
      zh: '2026 上半年 SF 凶殺率上升，是 36 個受調城市中僅有 8 個上升者之一（SFPD 自己的數字是 12 → 16 件）',
    },
  },
  {
    id: 'mission-local-drugs',
    url: 'https://missionlocal.org/2026/01/crime-stats-drugs-sf/',
    date: '2026-01-27',
    label: { en: 'Mission Local drug case analysis', zh: 'Mission Local 毒品案件分析' },
    note: {
      en: 'Drug cases up 54% from 2024 to 2025. In one month a quarter of every drug arrest in the city happened at 16th and Mission.',
      zh: '毒品案件 2024 → 2025 增 54%，單月全市四分之一的毒品逮捕發生在 16th & Mission',
    },
  },
  {
    id: 'mission-local-western-soma',
    url: 'https://missionlocal.org/2026/04/san-francisco-western-soma-crime-containment-zone/',
    date: '2026-04',
    label: { en: 'Mission Local: is western SoMa a containment zone', zh: 'Mission Local：西 SoMa 是不是收容區' },
    note: {
      en: 'Southern station is about 66 officers short with no foot patrol. Response to non-emergency calls runs 53% to 55% slower than the citywide median. One street, 6th, accounts for 22% of all SoMa reports.',
      zh: 'Southern 分局缺額約 66 名警力、零徒步巡邏；非緊急案件回應時間比全市中位數慢 53% 到 55%。6th Street 一條街佔 SoMa 全部報案的 22%',
    },
  },
  {
    id: 'standard-tents-soma',
    url: 'https://sfstandard.com/2026/04/03/sf-soma-tenderloin-mission-homeless/',
    date: '2026-04-03',
    label: { en: 'SF Standard: tents moving into SoMa', zh: 'SF Standard：帳篷移往 SoMa' },
    note: {
      en: 'Citywide tent counts hit a record low but the distribution shifted: SoMa up about 140% year on year while the Tenderloin fell 67% and the Mission 17%.',
      zh: '全市帳篷數創新低，但分布不均：SoMa 年增約 140%，同期 Tenderloin 減 67%、Mission 減 17%',
    },
  },
  {
    id: 'standard-tenderloin-lawsuit',
    url: 'https://sfstandard.com/2026/05/05/tenderloin-lawsuit-drug-crisis/',
    date: '2026-05-05',
    label: { en: 'SF Standard: Tenderloin lawsuit withdrawn', zh: 'SF Standard：Tenderloin 訴訟撤告' },
    note: {
      en: 'Residents withdrew their suit against the city on 2026-04-28, partly because plaintiffs conceded in hearings that conditions near their homes had genuinely improved.',
      zh: '居民對市府的毒品環境訴訟 2026/04/28 撤回，部分原因是原告在庭訊中承認住處附近狀況確有改善',
    },
  },
  {
    id: 'abc7-tenderloin-residents',
    url: 'https://abc7news.com/post/how-people-san-franciscos-tenderloin-perceive-reported-progress-drug-homelessness-issues/18885550/',
    date: '2026-04-15',
    label: { en: 'ABC7: how Tenderloin residents see it', zh: 'ABC7：Tenderloin 居民怎麼看' },
    note: {
      en: 'The counter-testimony from the same period: local organisers call Jones and Ellis the worst corner in the city, and residents say the drug problem has not changed.',
      zh: '同期反面證詞：Jones 與 Ellis 路口被在地組織者稱為全市最糟；居民說毒品問題沒變',
    },
  },
  {
    id: 'standard-lower-nob-hill',
    url: 'https://sfstandard.com/2026/02/26/san-francisco-lower-nob-hill-homeless-shelter/',
    date: '2026-02-26',
    label: { en: 'SF Standard: the Lower Nob Hill shelter fight', zh: 'SF Standard：Lower Nob Hill 收容所爭議' },
    note: {
      en: 'Lower Nob Hill total crime is down about 20% on 2019 while the city as a whole is down about 50%. Drug cases nearly doubled, weapons up 47.4%, 311 reports doubled. Most neighbours interviewed did not feel it had got worse.',
      zh: 'Lower Nob Hill 總犯罪較 2019 年減約 20%，但同期全市減約 50%；毒品案件近乎倍增、武器案 +47.4%、311 通報翻倍。多數受訪鄰居並未感到治安變差',
    },
  },
  {
    id: 'standard-union-square-ambassadors',
    url: 'https://sfstandard.com/2026/03/25/ambassadors-downtown-powell-street-lurie/',
    date: '2026-03-25',
    label: { en: 'SF Standard: what the Union Square ambassadors did', zh: 'SF Standard：Union Square 大使成效' },
    note: {
      en: 'Crime down 40% across Union Square and the Financial District, safety-related 911 calls down 53%, police response 58% faster.',
      zh: 'Union Square 與金融區犯罪減 40%，安全類 911 通報減 53%，警方回應快 58%',
    },
  },
  {
    id: 'potrero-view-station',
    url: 'https://www.potreroview.net/reported-crime-sharply-down-yet-residents-remain-uneasy/',
    date: '2025-10',
    label: { en: 'Potrero View station figures', zh: 'Potrero View 分局數據' },
    note: {
      en: 'Bayview station, which covers Potrero Hill and Dogpatch, is down about 30% on property and violent crime and 46% on vehicle theft, but homicide is up 33% and arson 26%.',
      zh: 'Bayview 分局（含 Potrero Hill、Dogpatch）財產與暴力犯罪減約 30%、車輛竊盜 -46%，但凶殺 +33%、縱火 +26%',
    },
  },
  {
    id: 'sfist-sunset-homicide',
    url: 'https://sfist.com/2026/03/25/san-francisco-sees-two-homicides-in-one-night/',
    date: '2026-03-25',
    label: { en: 'SFist: homicide in the Sunset', zh: 'SFist：Sunset 凶殺' },
    note: {
      en: 'One homicide each in the Sunset and Visitacion Valley on the same night, the 11th and 12th of 2026.',
      zh: 'Sunset 與 Visitacion Valley 同一晚各一起凶殺，是 2026 年第 11 與第 12 起',
    },
  },
  {
    id: 'standard-fentanyl-decade',
    url: 'https://sfstandard.com/2026/02/05/san-francisco-fentanyl-decade/',
    date: '2026-02-05',
    label: { en: 'SF Standard: a decade of fentanyl', zh: 'SF Standard：十年芬太尼' },
    note: {
      en: '621 overdose deaths in 2025, above 2024. The areas named: the Tenderloin, Bayview, Civic Center, Mission Bay, and along Market Street.',
      zh: '2025 年 621 人死於過量，高於 2024 年。點名的區域：Tenderloin、Bayview、Civic Center、Mission Bay、Market Street 沿線',
    },
  },
  {
    id: 'bar-castro-patrols',
    url: 'https://www.ebar.com/story/154411',
    date: '2025-04-30',
    label: { en: 'Bay Area Reporter: more police for the Castro', zh: 'Bay Area Reporter：Castro 增派警力' },
    note: {
      en: 'A run of street violence in the Castro over March and April 2025: a beating outside the Castro Theatre, a random attack at Castro and Market, a stabbing on 18th. Three further incidents went unreported and so could not be investigated. Supervisor Mandelman said publicly that this follows displacement from enforcement elsewhere.',
      zh: '2025 年 3 到 4 月 Castro 連續數起街頭暴力（Castro Theatre 前毆打、Castro 與 Market 隨機攻擊、18th Street 持刀）。⚠️ 另有三起未報案因此無法偵辦。Mandelman 公開表示這與其他區加強執法後的人口移轉有關',
    },
  },
  {
    id: 'bar-community-patrol',
    url: 'https://www.ebar.com/story/153700',
    date: '2025-03-26',
    label: { en: 'Bay Area Reporter: what the community patrol saw', zh: 'Bay Area Reporter：社區巡守觀察' },
    note: {
      en: 'Castro Community on Patrol logged four attacks on gay men in two weeks, three of them in the Castro, most circulating only on social media rather than being reported.',
      zh: 'Castro Community on Patrol 表示兩週內接獲四起針對同志男性的攻擊，其中三起在 Castro，多數只在社群媒體流傳未報案',
    },
  },
  {
    id: 'bar-hate-crime-2026',
    url: 'https://www.ebar.com/story/167469',
    date: '2026-06-18',
    label: { en: 'Bay Area Reporter: 2026 hate crime charges', zh: 'Bay Area Reporter：2026 仇恨犯罪起訴' },
    note: {
      en: 'In May 2026 a florist at Market and Church was defaced with homophobic graffiti; a resident who intervened was beaten and hit by a reversing car. Charged as a hate crime.',
      zh: '2026 年 5 月 Market 與 Church 路口花店遭恐同塗鴉，勸阻的住戶遭毆打並被倒車衝撞，以仇恨犯罪起訴',
    },
  },
  {
    id: 'noe-valley-voice',
    url: 'http://www.noevalleyvoice.com/2026/June/202606.pdf',
    date: '2026-06',
    label: { en: 'Noe Valley Voice monthly crime table', zh: 'Noe Valley Voice 月報犯罪表' },
    note: {
      en: 'Pulls SFPD data month by month. 887 incidents in 2025, down 21% on 2024. Only 8 robberies all year, and eight consecutive months with none from 2025-09 to 2026-04. The real exposure is burglary, 157 in 2025.',
      zh: '逐月抓 SFPD 資料。2025 全年 887 件、較 2024 減 21%；搶劫全年只有 8 件，且 2025/09 到 2026/04 連續八個月掛零。真正的風險是竊盜（2025 年 157 件）',
    },
  },
  {
    id: 'mission-local-west-portal',
    url: 'https://missionlocal.org/2026/07/san-francisco-sfmta-west-portal-safety-project/',
    date: '2026-07-21',
    label: { en: 'Mission Local: what the West Portal redesign did', zh: 'Mission Local：West Portal 改造成效' },
    note: {
      en: 'The redesign after a family of four died at the intersection in 2024, evaluated afterwards: collisions down 60%, serious injuries from 6.7 a year to 2.7, illegal U-turns down 75%, and residents feeling safe up from 50% to 70%.',
      zh: '2024 年一家四口死於路口車禍後的道路改造，事後評估：碰撞減 60%、嚴重傷害從每年 6.7 件降到 2.7 件、違規迴轉減 75%，居民安全感從 50% 升到 70%',
    },
  },
  {
    id: 'mission-local-cortland',
    url: 'https://missionlocal.org/2025/10/sf-bernal-heights-hit-and-run/',
    date: '2025-10-06',
    label: { en: 'Mission Local: the Cortland fatality', zh: 'Mission Local：Cortland 死亡車禍' },
    note: {
      en: 'Cortland Avenue in Bernal Heights is on the city high-injury network. A pre-dawn hit and run killed someone in October 2025 and the car was never found. SFMTA data shows nine people injured on that stretch in three years.',
      zh: 'Bernal Heights 的 Cortland Avenue 屬市府高風險道路名單。2025 年 10 月凌晨肇逃致死，車輛未尋獲。SFMTA 資料：三年內九人在該路段受傷',
    },
  },
  {
    id: 'glen-park-association',
    url: 'https://www.glenparkassociation.org/crime-and-safety/',
    date: '2026-08',
    label: { en: 'Glen Park Association monthly log', zh: 'Glen Park Association 月報' },
    note: {
      en: 'Lists SFPD incidents month by month. The distinction that matters: the robberies happen at the shopping centre on Diamond Heights Blvd and Gold Mine Dr, not in Glen Park village, and the problem at the BART entrance is theft from cars rather than robbery.',
      zh: '逐月列出 SFPD 事件。關鍵區分：搶劫案都發生在 Diamond Heights Blvd 與 Gold Mine Dr 的購物中心，不是 Glen Park 村子；BART 站口的問題是車內失竊，不是搶劫',
    },
  },
];

/**
 * tier 1 avoid / 2 take care / 3 depends on the block / 4 mostly comfortable / 5 comfortable
 *
 * `sources` holds ids from the list above. build-zones.js fails the build on a dangling
 * reference, so a claim can never quietly lose its evidence.
 */
export const AREAS = [
  {
    nhood: 'Tenderloin', tier: 1,
    summary: {
      en: 'The densest concentration of drug and street problems in the city, which nobody disputes. There is real evidence of improvement in 2026: a residents lawsuit was withdrawn because conditions got better, and tent counts fell 67% in a year. In the same period local organisers still call Jones and Ellis the worst corner in San Francisco. Walking through by day is fine. Night is a different question.',
      zh: '全市密度最高的毒品與街頭問題區，這點沒有爭議。2026 年確實有改善的證據，居民訴訟因為狀況好轉而撤告、帳篷數年減 67%，但同一時間在地組織者仍把 Jones 與 Ellis 路口稱為全市最糟。白天走沒問題，晚上是另一回事。',
    },
    signals: {
      en: ['Smallest station area in the city, yet homicide, robbery and assault stay high', 'Tents down 67% in a year, the largest drop anywhere in the city', 'Late-night dealing has not gone, it moved into the small hours'],
      zh: ['分局面積最小但凶殺、搶劫、傷害持續高檔', '帳篷年減 67%，是全市降幅最大的區', '深夜毒品交易未消失，只是移到凌晨'],
    },
    sources: ['standard-2025-stats', 'standard-tenderloin-lawsuit', 'abc7-tenderloin-residents', 'standard-tents-soma'],
  },
  {
    nhood: 'South of Market', part: 'west', id: 'soma-west', name: 'SoMa (west of 4th St)', tier: 2,
    summary: {
      en: 'The west side of 4th Street is why SoMa reads badly, and it is moving against the city. Tent counts hit a citywide low while SoMa rose about 140%, and 6th Street alone takes 22% of the district reports. Southern is the only large station where property crime went up, roughly 66 officers short, with non-emergency response over half again as slow as the median.',
      zh: '4th Street 以西就是 SoMa 名聲差的原因，而且它跟全市走反方向。全市帳篷數創新低的同時 SoMa 年增約 140%，6th Street 一條街就佔全區報案的 22%。Southern 分局財產犯罪是唯一逆勢上升的大分局，警力缺額約 66 人、非緊急案件回應時間慢一半以上。',
    },
    signals: {
      en: ['Tents up about 140% in a year while the city was falling', 'Station property crime +22.6%, the only rise in the city', '6th Street alone accounts for 22% of reports in the district', 'Non-emergency police response 53% to 55% slower than the citywide median'],
      zh: ['帳篷數年增約 140%，同期全市在減少', '分局財產犯罪 +22.6%，全市唯一上升', '6th Street 一條街佔全區報案的 22%', '非緊急案件警方回應比全市中位數慢 53% 到 55%'],
    },
    sources: ['examiner-by-station', 'standard-tents-soma', 'mission-local-western-soma', 'chronicle-by-neighborhood', 'yc-housing-guide'],
  },
  {
    nhood: 'South of Market', part: 'east', id: 'soma-east', name: 'SoMa (east of 4th St)', tier: 3,
    summary: {
      en: 'The convention side: Moscone, Yerba Buena and across to Rincon Hill, which reads much better than the blocks west of 4th. Event-day crowds keep it busy in daylight and it empties at night. The station-wide caveats still apply, since Southern is short-staffed and slow on non-emergency calls.',
      zh: '會展這一側：Moscone、Yerba Buena 到 Rincon Hill，比 4th St 以西好得多。活動日白天人多、入夜後變空。分局層級的缺點仍在——Southern 缺警力、非緊急案件回應慢。',
    },
    signals: {
      en: ['Markedly fewer reports than west of 4th; the Rincon Hill side is the best of SoMa', 'Busy on event days, empty at night', 'Same short-staffed station as the west side'],
      zh: ['報案量明顯低於 4th 以西，Rincon Hill 側是 SoMa 最好的一段', '活動日人多、夜間人少', '與西側同一個缺額分局'],
    },
    sources: ['examiner-by-station', 'mission-local-western-soma', 'yc-housing-guide'],
  },
  {
    nhood: 'Bayview Hunters Point', tier: 1,
    summary: {
      en: 'The station figures are actually improving, with property and violent crime down about 30% and vehicle theft down 46%, but homicide is up 33% and this is one of the areas where overdose deaths concentrate. Far from downtown, and transit thins out at night.',
      zh: '分局數據其實在改善，財產與暴力犯罪減約 30%、車輛竊盜減 46%，但凶殺增 33%，而且這裡也是過量致死集中的區域之一。距離市中心遠、夜間大眾運輸稀疏。',
    },
    signals: {
      en: ['Station property and violent crime down about 30%', 'Homicide +33%, arson +26%', 'One of the areas where overdose deaths concentrate'],
      zh: ['分局財產與暴力犯罪減約 30%', '凶殺 +33%、縱火 +26%', '過量致死集中區之一'],
    },
    sources: ['potrero-view-station', 'standard-fentanyl-decade'],
  },
  {
    nhood: 'Mission', part: 'west', id: 'mission-west', name: 'Mission (Valencia side)', tier: 3,
    summary: {
      en: 'West of Mission Street: the Valencia corridor, Dolores and 24th Street, which is another world from the eastern blocks. Lively, walkable, and mostly fine, but the character still shifts block by block, so walk your own street at night before signing anything.',
      zh: 'Mission Street 以西：Valencia 走廊、Dolores、24th Street，跟東側是兩個世界。熱鬧、好走、大致沒事，但街區之間變化仍大，租之前一定要在晚上實際走一次你那條街。',
    },
    signals: {
      en: ['Tents down 17% in a year', 'Improved after the 2026 street vending rules', 'Block-by-block variation; check your own street at night'],
      zh: ['帳篷數年減 17%', '2026 年街頭攤販新法上路後有改善', '街區間差異大，晚上實走確認'],
    },
    sources: ['mission-local-drugs', 'standard-tents-soma', 'yc-housing-guide'],
  },
  {
    nhood: 'Mission', part: 'east', id: 'mission-east', name: 'Mission (east of Mission St)', tier: 2,
    summary: {
      en: 'The eastern blocks around the 16th Street corridor are the concentrated part: 16th and Mission is the single most concentrated spot for drug arrests in the city, a quarter of the citywide total in one month. The 2026 street vending rules helped, but night enforcement is still limited by staffing.',
      zh: '東側 16th Street 走廊一帶就是集中的那段：16th 與 Mission 路口是全市毒品逮捕最集中的單一地點，單月佔全市四分之一。2026 年街頭攤販新法有幫助，但夜間執法仍受警力限制。',
    },
    signals: {
      en: ['16th and Mission took 25% of citywide drug arrests in a single month', 'Night enforcement limited by staffing', 'Improves quickly as you move south and west'],
      zh: ['16th & Mission 單月佔全市毒品逮捕的 25%', '夜間執法受警力限制', '往南往西走幾條街就明顯改善'],
    },
    sources: ['mission-local-drugs', 'yc-housing-guide'],
  },
  {
    nhood: 'Financial District', tier: 3,
    summary: {
      en: 'Busy on weekdays, empty at night and at weekends. Crime across Union Square and the Financial District is down 40% and safety-related calls down 53%; the street ambassador programme is genuinely working. The cost is that it does not feel lived in, and groceries and everyday errands are harder than in a residential neighbourhood.',
      zh: '上班時段人多、晚上跟週末空。Union Square 與金融區這一帶犯罪減 40%、安全類報案減 53%，街道大使計畫確實有效。缺點是生活感薄，超市與日常採買不如住宅區方便。',
    },
    signals: {
      en: ['Crime down 40%, safety-related 911 calls down 53%', 'Police response 58% faster', 'Very few people about in the evening and at weekends'],
      zh: ['犯罪減 40%，安全類 911 通報減 53%', '警方回應時間快 58%', '晚間與週末人流稀少'],
    },
    sources: ['standard-union-square-ambassadors'],
  },
  {
    nhood: 'Nob Hill', tier: 3,
    summary: {
      en: 'The top of the hill and the bottom are two different places. The north side is quiet and well kept, but the streets sloping south and west toward the Tenderloin, around Post, Sutter and Bush, are where the 2026 violence concentrated. Lower Nob Hill total crime is down about 20% on 2019 while the city fell about 50%, so it improved at half the rate everywhere else did.',
      zh: '山頂與山腳是兩個地方。北側安靜體面，但南側與西側往 Tenderloin 傾斜的那幾條街（Post、Sutter、Bush 一帶）2026 年的暴力事件都集中在那裡。Lower Nob Hill 總犯罪較 2019 年減約 20%，但同期全市減了約 50%，等於進步得比別人慢一半。',
    },
    signals: {
      en: ['Lower Nob Hill improved at half the citywide rate', 'Drug cases nearly doubled, weapons +47.4%, 311 reports doubled', '2026 violence concentrated along Post and Sutter'],
      zh: ['Lower Nob Hill 改善幅度只有全市的一半', '毒品案件近乎倍增、武器案 +47.4%、311 通報翻倍', '2026 年暴力事件集中在 Post 與 Sutter 一線'],
    },
    sources: ['standard-lower-nob-hill'],
  },
  {
    nhood: 'Castro/Upper Market', tier: 4,
    summary: {
      en: 'Good amenities, good nightlife, direct Muni. But a run of street violence in spring 2025 is on the record, including a beating outside the theatre and a stabbing, and the community patrol logged four attacks on gay men in two weeks. Reporting rates here are low and the police acknowledge incidents go unreported, so the recorded counts probably understate it. Foot patrols currently only cover daytime.',
      zh: '生活機能與夜生活都好，Muni 直達。但 2025 年春天連續幾起街頭暴力是有紀錄的，包括戲院前毆打與持刀，而且社區巡守說兩週內就有四起針對同志男性的攻擊。⚠️ 這一區的通報率偏低，警方自己承認有事件沒被報案，所以資料上的件數可能低估實況。徒步警力目前只有白天有。',
    },
    signals: {
      en: [
        'A run of street violence over March and April 2025, three of them unreported',
        'Reporting rates are low, so the data likely understates it',
        'Foot patrols are daytime only; one late-night call took over 30 minutes to answer',
        'A homophobic assault charged as a hate crime in 2026',
        'An elected official has publicly linked this to displacement from enforcement elsewhere',
      ],
      zh: [
        '2025 年 3 到 4 月連續街頭暴力，其中三起未報案',
        '⚠️ 通報率偏低，資料可能低估',
        '徒步巡邏只在白天，深夜曾發生報案到警方抵達逾 30 分鐘',
        '2026 年有以仇恨犯罪起訴的恐同攻擊案',
        '民代公開表示這與其他區加強執法後的人口移轉有關',
      ],
    },
    sources: ['bar-castro-patrols', 'bar-community-patrol', 'bar-hate-crime-2026'],
  },
  {
    nhood: 'Hayes Valley', tier: 4,
    summary: {
      en: 'Dense with restaurants and cafes and walkable to everything, which is why it is a common first neighbourhood in San Francisco. The eastern streets toward Civic Center are the dividing line: past Franklin the feel starts to change.',
      zh: '餐廳咖啡密度高、走路到哪都近，是很多人第一次住 SF 的首選。東邊靠近 Civic Center 那幾條街是分界線，過了 Franklin 感覺就開始變。',
    },
    signals: {
      en: ['Among the highest amenity density in the city', 'The eastern edge meets Civic Center; the character changes within a block or two'],
      zh: ['生活機能密度全市前段', '東緣接 Civic Center，一兩條街就換氣氛'],
    },
    sources: ['standard-2025-stats'],
  },
  {
    // The city's boundary set has no separate Dogpatch polygon; it sits inside Potrero Hill,
    // so the Dogpatch-specific finding is folded in here rather than given a drawn shape.
    nhood: 'Potrero Hill', tier: 4,
    summary: {
      en: 'Quiet, sunny, with a view of the skyline, and the station figures are improving. The cost is that the hill is steep and transit is weak, so without a car you are walking uphill and waiting for buses. Dogpatch on the east side is much flatter and has the T line, but a run of apartment buildings there were entered with postal keys in early 2025, so ask how the building controls its front door.',
      zh: '安靜、有陽光、看得到市區天際線，分局數據也在改善。代價是坡很陡而且大眾運輸偏弱，沒有車的話要接受走路上坡跟等公車。東側的 Dogpatch 平坦得多、有 T 線，但 2025 年初有連續數棟公寓被用郵務鑰匙侵入，看房時要問清楚門禁怎麼管。',
    },
    signals: {
      en: ['Station property and violent crime down about 30% and vehicle theft down 46%, but homicide up 33%', 'Steep, and Muni coverage is thinner than on the northeast side', 'Several Dogpatch buildings entered with postal keys in early 2025; police and the postal service blamed each other'],
      zh: ['分局財產與暴力犯罪減約 30%、車輛竊盜 -46%，但凶殺 +33%', '坡度陡，Muni 覆蓋不如東北側', 'Dogpatch 2025 年初多棟公寓遭郵務鑰匙侵入，警方與郵局互推責任'],
    },
    sources: ['potrero-view-station'],
  },
  {
    nhood: 'Mission Bay', tier: 4,
    summary: {
      en: 'New, clean and planned, and for actually living here the record is good: the 2025 crime rise that shows in the citywide table is almost entirely theft from two big-box stores on 4th Street, not violence in the residential blocks, and Southern station recorded no homicides here. The real drawback is how empty it gets after dark.',
      zh: '新、乾淨、規劃整齊，就居住而言紀錄其實不錯：全市統計上 2025 年的犯罪上升幾乎全來自 4th Street 兩家大型量販店的竊盜，不是住宅區的暴力犯罪，Southern 分局在這裡零凶殺。真正的缺點是入夜後很空。',
    },
    signals: {
      en: ['Crime rose in 2025, but almost entirely big-box store theft', 'No homicides recorded here by the station', 'Very few people about after dark'],
      zh: ['2025 年犯罪上升，但幾乎全是量販店竊盜', '分局在此區零凶殺', '入夜後行人稀少'],
    },
    sources: ['chronicle-by-neighborhood', 'potrero-view-station'],
  },
  {
    nhood: 'North Beach', tier: 4,
    summary: {
      en: 'Property crime fell by nearly half in 2025, one of the biggest improvements in the city. The real risk here is not crime but traffic: three pedestrian or scooter casualties in the first five months of 2026, and Broadway is on the city high-injury network.',
      zh: '2025 年財產犯罪減近 50%，是全市改善幅度最大的區之一。真正的風險不是治安而是交通，2026 年前五個月就有三起行人或滑板車傷亡，Broadway 在市府的高風險道路名單上。',
    },
    signals: {
      en: ['Property crime down nearly 50%', 'Three pedestrian and scooter casualties in five months of 2026', 'Broadway is on the high-injury network'],
      zh: ['財產犯罪減近 50%', '2026 年五個月內三起行人與滑板車傷亡', 'Broadway 屬高風險道路'],
    },
    sources: ['chronicle-by-neighborhood'],
  },
  {
    nhood: 'Russian Hill', tier: 4,
    summary: {
      en: 'A quiet residential area with almost no street crime reported across 2025 and 2026. What to check is the building rather than the block: the stock here is old, and lifts and plumbing may be from the last century. The hills are steep.',
      zh: '安靜的住宅區，2025 到 2026 幾乎沒有街頭犯罪報導。要注意的是屋況，這一帶老公寓多，電梯與管線都可能是上個世紀的。坡也很陡。',
    },
    signals: {
      en: ['Almost no street crime reported', 'Old building stock, so inspect the unit itself', 'Steep'],
      zh: ['幾乎無街頭犯罪報導', '建物老舊，租屋要看屋況', '坡度陡'],
    },
    sources: ['standard-2025-stats'],
  },
  {
    nhood: 'Marina', tier: 5,
    summary: {
      en: 'One of the steadiest residential areas in the city: flat, clean, easy to shop in. The cost is distance from downtown and no rail at all, so commuting means a bus or a car.',
      zh: '全市最平穩的住宅區之一，平地、乾淨、採買方便。代價是離市中心遠、沒有軌道交通，通勤只能靠公車或叫車。',
    },
    signals: {
      en: ['No solid 2025 to 2026 local crime reporting to draw on; a low-incident area', 'No BART and no Muni Metro, so commuting depends on buses'],
      zh: ['缺少可靠的 2025 到 2026 在地犯罪報導，屬低事件區', '無 BART 與 Muni Metro，通勤依賴公車'],
    },
    sources: ['sfpd-2025'],
  },
  {
    nhood: 'Pacific Heights', tier: 5,
    summary: {
      en: 'Quiet, spacious, consistently safe. Rents match, and it is residential enough that there is not much to do in the evening.',
      zh: '安靜、寬敞、治安穩定。租金也相應地高，而且生活圈偏住宅，晚上沒什麼可去的地方。',
    },
    signals: { en: ['Low-incident area', 'High rents'], zh: ['低事件區', '租金水位高'] },
    sources: ['sfpd-2025'],
  },
  {
    nhood: 'Noe Valley', tier: 5,
    summary: {
      en: 'This neighbourhood has the most complete local crime record in the city, and the numbers are the cleanest set anywhere: 8 robberies in all of 2025, with eight consecutive months at zero from September 2025 to April 2026. What to actually guard against is burglary, 157 for the year, a good share of them with someone home. The drawbacks are distance, hills, and evenings quiet enough to be dull.',
      zh: '這一區有全市最完整的在地犯罪紀錄，數字也是最乾淨的一組：2025 全年搶劫只有 8 件，而且 2025 年 9 月到 2026 年 4 月連續八個月掛零。真正要防的是竊盜，全年 157 件、其中不少是有人在家時被闖入。缺點是離市區遠、坡多，晚上安靜到有點無聊。',
    },
    signals: {
      en: [
        '8 robberies in all of 2025, and eight consecutive months at zero from 2025-09 to 2026-04',
        'Crime overall down 21% on 2024',
        'Burglary is the main exposure, 157 in 2025, including entries with someone home',
        'The headline theft figure is inflated by repeated shoplifting at one pharmacy and does not describe street risk',
        'Far from downtown, and the J is a slow commute',
      ],
      zh: [
        '2025 全年搶劫 8 件，2025/09 到 2026/04 連續八個月零搶劫',
        '整體犯罪較 2024 年減 21%',
        '⚠️ 竊盜是主要風險，2025 年 157 件，包含有人在家時的闖入',
        '帳面上的竊盜數字被單一藥妝店的連續行竊灌水，不代表街頭風險',
        '距市中心遠，J 線通勤慢',
      ],
    },
    sources: ['noe-valley-voice'],
  },
  {
    nhood: 'Inner Sunset', tier: 5,
    summary: {
      en: 'Quiet, affordable, next to the park, with the N running straight downtown. The drawbacks are the fog and the distance.',
      zh: '安靜、平價、靠公園，N 線直達市區。缺點就是霧跟遠。',
    },
    signals: { en: ['Low-incident area', 'The N Judah is direct but the ride is long'], zh: ['低事件區', 'N Judah 直達，但通勤時間長'] },
    sources: ['sfpd-2025'],
  },
  {
    nhood: 'Sunset/Parkside', tier: 5,
    summary: {
      en: 'One of the quietest residential parts of the city, and rents are relatively kind. Without a car everything feels far, and in fog season you barely see the sun.',
      zh: '全市最安靜的住宅區之一，租金相對友善。沒有車的話會覺得什麼都很遠，霧季幾乎不見太陽。',
    },
    signals: { en: ['Low-incident area', 'Long commutes and amenities spread thin'], zh: ['低事件區', '通勤時間長，生活機能分散'] },
    sources: ['sfpd-2025'],
  },
  {
    nhood: 'Outer Richmond', tier: 5,
    summary: {
      en: 'Quiet, cheap, by the ocean. Difficult without a car, and the coldest and foggiest part of the city.',
      zh: '安靜、便宜、靠海。沒車會很不方便，而且是全市最冷最多霧的一帶。',
    },
    signals: { en: ['Low-incident area', 'No rail, buses only'], zh: ['低事件區', '無軌道交通，公車為主'] },
    sources: ['sfpd-2025'],
  },
  {
    nhood: 'Inner Richmond', tier: 5,
    summary: {
      en: 'Dense with Asian groceries and restaurants so everyday shopping is easy, and it is consistently safe. Some distance from downtown, with bus commutes starting around half an hour.',
      zh: '亞洲超市與餐廳密度高、日常採買很方便，治安穩定。離市中心有距離，公車通勤約半小時起跳。',
    },
    signals: { en: ['Low-incident area', 'Clement Street covers everyday needs'], zh: ['低事件區', 'Clement Street 生活機能完整'] },
    sources: ['sfpd-2025'],
  },
  {
    nhood: 'Glen Park', tier: 5,
    summary: {
      en: 'Small and quiet, and the BART station is the real advantage: the commute beats anywhere else this calm. The month-by-month record shows almost no violence in the village itself, and the problem at the station entrance is theft from cars. Keep two places apart: the intersection up the hill by the Diamond Heights shopping centre carries far more incidents than the village, and they are not the same thing.',
      zh: '小而安靜，有 BART 站是最大優勢，通勤比同樣安靜的西區快得多。逐月的事件紀錄裡村子本身幾乎沒有暴力案件，BART 站口的問題是車內失竊。⚠️ 要分清楚兩個地方：山上 Diamond Heights 購物中心那個路口的事件量遠高於村子，兩者不是同一回事。',
    },
    signals: {
      en: [
        'Almost no violence in the village itself; the station entrance sees theft from cars',
        'The robberies are all at the Diamond Heights shopping centre up the hill, not in Glen Park village',
        'BART runs straight downtown',
        'Amenities are confined to the block around Chenery and Diamond',
      ],
      zh: [
        '村子本身幾乎無暴力案件，BART 站口的問題是車內失竊',
        '⚠️ 搶劫案都發生在山上的 Diamond Heights 購物中心，不是 Glen Park 村',
        'BART 直達市中心',
        '生活機能只有 Chenery 與 Diamond 那一小塊',
      ],
    },
    sources: ['glen-park-association'],
  },
  {
    nhood: 'West of Twin Peaks', tier: 5,
    summary: {
      en: 'Purely residential and very quiet, which suits someone who wants to be well away from city noise. West Portal is the only part with full amenities and Muni, and after the 2024 crash that killed a family of four the intersection was rebuilt: the evaluation found collisions down 60% and residents feeling safe up from 50% to 70%. Without a car, only the area near West Portal station is realistic.',
      zh: '純住宅、非常安靜，適合想完全遠離市區噪音的人。West Portal 那一段是這區唯一有完整生活機能與 Muni 的地方，而且 2024 年那場撞死一家四口的車禍之後做了道路改造，事後評估碰撞減 60%、居民安全感從五成升到七成。沒車的話只有 West Portal 站附近可考慮。',
    },
    signals: {
      en: ['After the West Portal redesign, collisions down 60% and serious injuries from 6.7 a year to 2.7', 'Muni only covers the West Portal area; transit elsewhere is weak', 'Low-incident area'],
      zh: ['West Portal 改造後碰撞減 60%、嚴重傷害從每年 6.7 件降到 2.7 件', 'Muni 只覆蓋 West Portal 一帶，其餘地區大眾運輸弱', '低事件區'],
    },
    sources: ['mission-local-west-portal', 'sfpd-2025'],
  },
  {
    nhood: 'Twin Peaks', tier: 5,
    summary: {
      en: 'Quiet with a view, but steep enough that walking is not realistic, so in practice you need a car. Note that the stories online about tourist car break-ins here almost all trace back to 2017 figures; there is nothing reported for 2025 or 2026, so do not read the old numbers as current. Trails and parking are also under construction into late 2026 and the routes keep changing.',
      zh: '安靜、視野好，但坡陡到走路不現實，實質上需要車。⚠️ 網路上關於這裡遊客車輛被砸的說法幾乎都引自 2017 年的數字，2025 到 2026 我找不到任何相關報導，不要把舊資料當現況。另外步道與停車場整修到 2026 年底，動線還在變。',
    },
    signals: {
      en: ['No crime reporting for 2025 or 2026; the widely quoted car break-in figures are from 2017', 'Trails and parking under construction into late 2026, with one trail closed from May', 'Extremely steep, so a car is effectively required'],
      zh: ['2025 到 2026 無犯罪相關報導；流傳的車輛竊案數字出自 2017 年', '⚠️ 步道與停車區整修至 2026 年底，其中一條步道 5 月起封閉', '坡度極陡，實質上需要車'],
    },
    sources: ['sfpd-2025'],
  },
  {
    nhood: 'Bernal Heights', tier: 4,
    summary: {
      en: 'Strong sense of neighbourhood, quiet, and the hilltop park is why a lot of people move here. What is actually on the record as dangerous is traffic rather than crime: Cortland Avenue, the main street, is on the city high-injury network, someone was killed by a speeding car in the small hours of October 2025 and the vehicle was never found, and nine people have been injured on that stretch in three years. If you live along Cortland, take care crossing at night.',
      zh: '社區感強、安靜，山頂公園是很多人搬來的理由。這裡真正被記錄下來的危險不是治安而是交通：主街 Cortland Avenue 在市府的高風險道路名單上，2025 年 10 月凌晨有人被超速車輛撞死、車輛至今未尋獲，三年內同一路段有九人受傷。要住 Cortland 沿線的話，晚上過馬路要當心。',
    },
    signals: {
      en: [
        'Cortland Avenue is on the high-injury network: a fatal hit and run in October 2025, nine injured in three years',
        'Residents asked for street lighting and night enforcement; no follow-up on record yet',
        'The covering station recorded the most homicides in the city in 2025, but it covers far more than this neighbourhood',
        'Steep, and buses rather than rail',
      ],
      zh: [
        '⚠️ Cortland Avenue 屬高風險道路，2025 年 10 月肇逃致死，三年內九人受傷',
        '居民要求增設路燈與夜間執法，尚未見到後續改善的紀錄',
        '所屬分局 2025 年凶殺數全市最多，但涵蓋範圍遠大於本區',
        '坡陡，公車為主',
      ],
    },
    sources: ['mission-local-cortland', 'standard-2025-stats'],
  },
  {
    nhood: 'Lincoln Park', tier: 3,
    summary: {
      en: 'Parkland, not a residential neighbourhood. It is listed because its registered population is 179, so any per-capita crime ranking reads it as dangerous. That is purely an artefact of the denominator.',
      zh: '公園用地，不是住宅區。列在這裡是因為它的登記人口只有 179 人，任何以人均計算的犯罪排名都會把這裡算成危險地帶，那純粹是分母造成的假象。',
    },
    signals: { en: ['Not residential', 'Registered population 179, so per-capita statistics are meaningless'], zh: ['非住宅區', '登記人口 179 人，人均統計失真'] },
    sources: ['sfpd-2025'],
  },
  {
    nhood: 'Haight Ashbury', tier: 3,
    summary: {
      en: 'Tourists and street population mixed together, lively by day and a sharp drop at night. Absolute incident counts are not high and the covering station is well staffed, but who is on the street varies, and so does how it feels.',
      zh: '觀光與街頭人口混雜，白天熱鬧晚上落差大。事件的絕對數字不高，所屬分局警力充足，但街上組成複雜，體感因人而異。',
    },
    signals: { en: ['Covering station is at 98% of recommended staffing', 'Concentrated street population, and impressions vary a lot'], zh: ['所屬分局警力配置達建議值 98%', '街頭人口集中，體感落差大'] },
    sources: ['mission-local-western-soma'],
  },
  {
    nhood: 'Western Addition', tier: 3,
    summary: {
      en: 'Varies enormously block to block; the good streets are genuinely pleasant to live on, but in February 2026 a teenager was shot dead near a park here. Walk it before you sign.',
      zh: '街廓之間差異很大，好的幾條街很宜居，但 2026 年 2 月有青少年在公園附近的槍擊致死案。租之前務必實地走。',
    },
    signals: { en: ['Three people shot near Golden Gate and Laguna in February 2026, one 15-year-old killed'], zh: ['2026 年 2 月 Golden Gate 與 Laguna 一帶發生三人中槍、一名 15 歲死亡'] },
    sources: ['standard-2025-stats'],
  },
  {
    nhood: 'Japantown', tier: 4,
    summary: {
      en: 'Small, clean, with amenities concentrated around the mall, and reasonably central. There is little local reporting from 2025 or 2026, so this tier carries less confidence than the others.',
      zh: '小、乾淨、生活機能集中在商場那一塊，位置也算中心。缺少 2025 到 2026 的在地報導，所以這個判定信心比其他區低。',
    },
    signals: { en: ['Little recent local reporting, so lower confidence', 'Borders Western Addition, and the edge varies'], zh: ['缺少近期在地報導，判定信心較低', '鄰接 Western Addition，邊界地帶差異大'] },
    sources: ['sfpd-2025'],
  },
  {
    nhood: 'Chinatown', tier: 3,
    summary: {
      en: 'Extremely busy by day with cheap and easy shopping, and it quietens at night. Narrow streets and old buildings, so rental stock tends to be dated.',
      zh: '白天極熱鬧、採買便宜方便，晚上安靜下來。街道窄、老屋多，租屋條件通常比較舊。',
    },
    signals: { en: ['A random stabbing in 2026', 'Old buildings, and living conditions vary widely'], zh: ['2026 年有隨機持刀傷人案', '建物老舊，居住條件落差大'] },
    sources: ['standard-2025-stats'],
  },
  {
    nhood: 'Excelsior', tier: 3,
    summary: {
      en: 'A quiet residential area with relatively low rents, but there was a run of gold chain snatchings around Geneva in 2026, and it is far from downtown.',
      zh: '安靜的住宅區、租金相對低，但 2026 年 Geneva 一帶有連續搶奪金鏈的案件，而且離市中心遠。',
    },
    signals: { en: ['A run of snatchings around Geneva in April and May 2026', 'Long commute'], zh: ['2026 年 4 到 5 月 Geneva 一帶連續搶奪案', '通勤時間長'] },
    sources: ['standard-2025-stats'],
  },
  {
    nhood: 'Visitacion Valley', tier: 2,
    summary: {
      en: 'Among the lowest rents in the city, at the cost of a long commute and a homicide around Sunnydale in March 2026. The ranking sites contradict each other on this area, so walk it before deciding.',
      zh: '租金是全市最低的一群，代價是通勤遠且 2026 年 3 月 Sunnydale 一帶發生凶殺。排名網站對這區的評價自相矛盾，實地走過再決定。',
    },
    signals: { en: ['A homicide around Sunnydale in March 2026', 'The ranking sites reach contradictory conclusions'], zh: ['2026 年 3 月 Sunnydale 一帶凶殺', '各家排名網站結論互相矛盾'] },
    sources: ['sfist-sunset-homicide'],
  },
  {
    nhood: 'Portola', tier: 4,
    summary: {
      en: 'A quiet residential area with friendly prices; the drawbacks are distance from downtown and amenities spread thin.',
      zh: '安靜的住宅區，房價與租金友善，缺點是離市中心遠、生活機能分散。',
    },
    signals: { en: ['Low-incident area', 'Long commute'], zh: ['低事件區', '通勤時間長'] },
    sources: ['sfpd-2025'],
  },
  {
    nhood: 'Outer Mission', tier: 3,
    summary: {
      en: 'Quiet, low rents, and close to Balboa Park BART, so the commute is better than you would expect. Amenities run along Mission Street.',
      zh: '安靜、租金低、靠近 Balboa Park BART，通勤其實不差。生活機能集中在 Mission Street 沿線。',
    },
    signals: { en: ['Balboa Park BART is usable', 'Amenities concentrated on a single street'], zh: ['Balboa Park BART 可用', '生活機能集中單一街道'] },
    sources: ['sfpd-2025'],
  },
  {
    nhood: 'Oceanview/Merced/Ingleside', tier: 3,
    summary: {
      en: 'Low rents and close to BART, but there is little recent local reporting and the covering station has a high homicide count.',
      zh: '租金低、靠 BART，但缺少近期在地報導，而且所屬分局的凶殺數字偏高。',
    },
    signals: { en: ['Little recent local reporting', 'The covering station recorded the most homicides in the city in 2025'], zh: ['缺少近期在地報導', '所屬分局 2025 年凶殺數全市最多'] },
    sources: ['standard-2025-stats'],
  },
  {
    nhood: 'Lakeshore', tier: 4,
    summary: {
      en: 'By the lake and the university, very quiet, and suits anyone who wants space. In practice you need a car.',
      zh: '靠湖與大學、非常安靜，適合要空間的人。實質上需要車。',
    },
    signals: { en: ['Low-incident area', 'Weak transit'], zh: ['低事件區', '大眾運輸弱'] },
    sources: ['sfpd-2025'],
  },
  {
    nhood: 'Golden Gate Park', tier: 3,
    summary: {
      en: 'The park is not a residential area. It is here because its registered population is tiny, so any per-capita crime ranking reads it as the most dangerous place in the city. That is the denominator, not the park.',
      zh: '公園本身不是住宅區。放在這裡是因為公園登記人口極少，任何以人均計算的犯罪排名都會把這裡算成全市最危險，那是分母造成的假象。',
    },
    signals: { en: ['Not residential', 'Registered population is tiny, so a per-capita rate is meaningless'], zh: ['非住宅區', '登記人口極少，人均犯罪率無意義'] },
    sources: ['sfpd-2025'],
  },
  {
    nhood: 'McLaren Park', tier: 3,
    summary: {
      en: 'Same as above: a park, not a residential area. Registered population 155, which makes a per-capita rate here entirely meaningless.',
      zh: '同上，公園不是住宅區。登記人口 155 人，人均犯罪率在這裡完全沒有意義。',
    },
    signals: { en: ['Not residential', 'Registered population 155, so per-capita statistics are meaningless'], zh: ['非住宅區', '登記人口 155 人，人均統計失真'] },
    sources: ['sfpd-2025'],
  },
  {
    nhood: 'Presidio', tier: 5,
    summary: {
      en: 'National park land, quiet enough that street incidents barely exist. Few places to rent, and most come with unusual leases.',
      zh: '國家公園用地，安靜到幾乎沒有街頭事件。住宅選擇少且多為特殊租約。',
    },
    signals: { en: ['Low-incident area', 'Very little housing supply'], zh: ['低事件區', '住宅供給少'] },
    sources: ['sfpd-2025'],
  },
  {
    nhood: 'Presidio Heights', tier: 5,
    summary: { en: 'Quiet, expensive, purely residential.', zh: '安靜、昂貴、純住宅。' },
    signals: { en: ['Low-incident area'], zh: ['低事件區'] },
    sources: ['sfpd-2025'],
  },
  {
    nhood: 'Seacliff', tier: 5,
    summary: { en: 'An extremely quiet, expensive residential area, a long way from the centre.', zh: '極安靜的高價住宅區，離市區很遠。' },
    signals: { en: ['Low-incident area', 'Inconvenient commute'], zh: ['低事件區', '通勤不便'] },
    sources: ['sfpd-2025'],
  },
  {
    nhood: 'Lone Mountain/USF', tier: 4,
    summary: { en: 'Lots of students, decent amenities, plenty of hills. Steady overall.', zh: '學生多、生活機能還行、坡多。整體平穩。' },
    signals: { en: ['Low-incident area', 'Noticeably hilly'], zh: ['低事件區', '坡度明顯'] },
    sources: ['sfpd-2025'],
  },
  {
    nhood: 'Treasure Island', tier: 3,
    summary: { en: 'Quiet but isolated. The bridge is the only way on and off, so it is barely workable without a car.', zh: '安靜但孤立，進出只能靠橋，沒車幾乎不可行。' },
    signals: { en: ['Severely limited access'], zh: ['交通高度受限'] },
    sources: ['sfpd-2025'],
  },
];
