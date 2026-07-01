export const resourceKeys = ["faith", "people", "military", "wealth"];

export const resourceLabels = {
  faith: "GPA",
  people: "Friends",
  military: "Energy",
  wealth: "Budget"
};

export const initialMeters = {
  faith: 50,
  people: 50,
  military: 50,
  wealth: 50
};

export const portraitProfiles = [
  "roommate",
  "ta",
  "club",
  "advisor",
  "athlete",
  "barista",
  "ra",
  "classmate",
  "professor",
  "mentor",
  "journalist",
  "artist",
  "coder",
  "activist",
  "librarian",
  "medic",
  "captain",
  "founder",
  "counselor",
  "parent"
];

const domains = {
  study: "Academics",
  social: "Social Life",
  club: "Clubs",
  dorm: "Dorm",
  money: "Money",
  health: "Wellbeing",
  career: "Career",
  ethics: "Integrity",
  campus: "Campus",
  family: "Family"
};

const followUps = {
  "1:right": { cardId: "campus-088", minDelay: 3, maxDelay: 6, reason: "The messy citation choice gets audited." },
  "6:right": { cardId: "campus-103", minDelay: 3, maxDelay: 7, reason: "The group chat fight keeps spreading." },
  "8:right": { cardId: "campus-111", minDelay: 4, maxDelay: 7, reason: "The cleaned data is questioned." },
  "18:right": { cardId: "campus-118", minDelay: 3, maxDelay: 6, reason: "Shared exam answers leak beyond one friend." },
  "28:right": { cardId: "campus-124", minDelay: 4, maxDelay: 8, reason: "The leaked quiz screenshot reaches the course staff." },
  "43:left": { cardId: "campus-132", minDelay: 3, maxDelay: 6, reason: "The protest organizing needs a public face." },
  "57:up": { cardId: "campus-137", minDelay: 2, maxDelay: 5, reason: "Your repair plan gets a real hearing." },
  "141:right": { cardId: "campus-253", minDelay: 3, maxDelay: 6, reason: "An AI-assisted essay draft draws scrutiny." },
  "146:up": { cardId: "campus-237", minDelay: 2, maxDelay: 5, reason: "A mentor follows up on your conference question." },
  "157:right": { cardId: "campus-172", minDelay: 3, maxDelay: 7, reason: "A rumor you amplified gets screenshotted." },
  "166:left": { cardId: "campus-255", minDelay: 2, maxDelay: 6, reason: "A private apology turns into a formal mediation." },
  "173:right": { cardId: "campus-269", minDelay: 4, maxDelay: 8, reason: "A branded club deal reaches student senate." },
  "181:right": { cardId: "campus-270", minDelay: 3, maxDelay: 6, reason: "An event crowd-control choice reaches campus safety." },
  "189:right": { cardId: "campus-257", minDelay: 3, maxDelay: 6, reason: "A dorm guest dispute reaches housing." },
  "198:left": { cardId: "campus-271", minDelay: 2, maxDelay: 5, reason: "A maintenance complaint becomes a building-wide case." },
  "205:left": { cardId: "campus-258", minDelay: 3, maxDelay: 7, reason: "Emergency aid paperwork gets reviewed." },
  "214:right": { cardId: "campus-272", minDelay: 3, maxDelay: 6, reason: "A risky purchase plan affects your campus account." },
  "221:right": { cardId: "campus-236", minDelay: 2, maxDelay: 5, reason: "A pushed-through illness gets worse." },
  "230:left": { cardId: "campus-273", minDelay: 3, maxDelay: 6, reason: "A missed clinic appointment becomes a policy reminder." },
  "237:right": { cardId: "campus-252", minDelay: 3, maxDelay: 6, reason: "An interview shortcut creates a second interview problem." },
  "246:right": { cardId: "campus-274", minDelay: 4, maxDelay: 8, reason: "A networking promise becomes visible." },
  "253:right": { cardId: "campus-275", minDelay: 2, maxDelay: 5, reason: "A weak explanation turns into an honor review." },
  "261:left": { cardId: "campus-276", minDelay: 3, maxDelay: 6, reason: "A reported survey leak needs testimony." },
  "269:left": { cardId: "campus-284", minDelay: 3, maxDelay: 7, reason: "A public comment starts a larger campus debate." },
  "278:up": { cardId: "campus-279", minDelay: 2, maxDelay: 5, reason: "A data request gets picked up by administrators." },
  "285:right": { cardId: "campus-300", minDelay: 3, maxDelay: 6, reason: "A family boundary conversation comes back." },
  "293:left": { cardId: "campus-280", minDelay: 3, maxDelay: 6, reason: "A family money conversation becomes a planning meeting." }
};

const followUpNumbers = new Set(
  Object.values(followUps).map((item) => Number(item.cardId.replace("campus-", "")))
);

const zhOptionText = {
  "Do the hard part first": "先啃难点",
  "Patch the answer": "先补表面",
  "Ask one precise question": "精准提问",
  "Rebuild it cleanly": "认真重做",
  "Submit the shortcut": "先交捷径版",
  "Ask for a boundary": "询问边界",
  "Set a firm limit": "明确边界",
  "Go along with it": "一起参与",
  "Negotiate a system": "协商规则",
  "Protect your time": "保护时间",
  "Take the extra shift": "多接班次",
  "Take a smaller deal": "折中处理",
  "Choose class first": "优先上课",
  "Step into the spotlight": "站到台前",
  "Recruit help": "找人帮忙",
  "Recover properly": "认真恢复",
  "Push through": "硬撑推进",
  "Shrink the plan": "缩小计划",
  "Talk privately": "私下沟通",
  "Make it public": "公开回应",
  "Use a mediator": "请人调解",
  "Do the clean version": "做干净版本",
  "Take the shortcut": "走捷径",
  "Ask the instructor": "问老师",
  "Wait until it is ready": "准备好再发",
  "Send it now": "现在发送",
  "Ask for a fast review": "请人快审",
  "Speak up": "站出来说",
  "Ignore it": "先不管",
  "Build evidence": "整理证据",
  "Be fully honest": "如实说明",
  "Keep it polished": "报喜不报忧",
  "Set a time to talk": "约时间聊",
  "Save the cash": "先省钱",
  "Buy the advantage": "买下优势",
  "Find a cheaper route": "找便宜方案",
  "Decline the role": "拒绝角色",
  "Lead it yourself": "自己带头",
  "Share leadership": "共同负责"
};

const optionTextVariants = {
  "Do the hard part first": [["Do the hard part first", "先啃难点"], ["Start with the ugly part", "先处理最丑的部分"], ["Work from first principles", "从原理重来"]],
  "Patch the answer": [["Patch the answer", "先补表面"], ["Make it look complete", "先做得像完成了"], ["Smooth the weak spot", "把漏洞抹平"]],
  "Ask one precise question": [["Ask one precise question", "精准提问"], ["Bring one sharp question", "带着一个具体问题去问"], ["Ask for the missing step", "只问卡住的那一步"]],
  "Rebuild it cleanly": [["Rebuild it cleanly", "认真重做"], ["Redo the source trail", "重做来源链"], ["Start over properly", "按规矩重来"]],
  "Submit the shortcut": [["Submit the shortcut", "先交捷径版"], ["Ship the messy version", "先交混合版"], ["Trust the shortcut", "押注捷径"]],
  "Ask for a boundary": [["Ask for a boundary", "询问边界"], ["Clarify the rule", "问清规则"], ["Check the line first", "先确认红线"]],
  "Set a firm limit": [["Set a firm limit", "明确边界"], ["Say no clearly", "直接说不"], ["Draw the line", "划清界限"]],
  "Go along with it": [["Go along with it", "一起参与"], ["Keep the peace", "先维持气氛"], ["Join for tonight", "今晚先加入"]],
  "Negotiate a system": [["Negotiate a system", "协商规则"], ["Make a shared rule", "定共同规则"], ["Turn it into a rota", "改成轮值安排"]],
  "Protect your time": [["Protect your time", "保护时间"], ["Keep the evening", "保住今晚"], ["Guard your calendar", "守住日程"]],
  "Take the extra shift": [["Take the extra shift", "多接班次"], ["Grab the paid hours", "接下有薪时段"], ["Work the closing shift", "接打烊班"]],
  "Take a smaller deal": [["Take a smaller deal", "折中处理"], ["Take one piece", "只接一部分"], ["Negotiate fewer hours", "谈少一点时间"]],
  "Choose class first": [["Choose class first", "优先上课"], ["Pick the grade", "先保成绩"], ["Go study instead", "转身去复习"]],
  "Step into the spotlight": [["Step into the spotlight", "站到台前"], ["Take the visible role", "接下显眼位置"], ["Be the face of it", "出面扛起来"]],
  "Recruit help": [["Recruit help", "找人帮忙"], ["Pull in backup", "拉个帮手"], ["Delegate the mess", "把事情分出去"]],
  "Recover properly": [["Recover properly", "认真恢复"], ["Actually rest", "真的休息"], ["Choose the boring recovery", "选枯燥但有效的恢复"]],
  "Push through": [["Push through", "硬撑推进"], ["Muscle through it", "咬牙撑过去"], ["Ignore the warning sign", "无视身体提醒"]],
  "Shrink the plan": [["Shrink the plan", "缩小计划"], ["Make the plan smaller", "把计划砍小"], ["Do the minimum that works", "只做有效最低限"]],
  "Talk privately": [["Talk privately", "私下沟通"], ["Message them first", "先私信对方"], ["Take it offline", "线下说清楚"]],
  "Make it public": [["Make it public", "公开回应"], ["Answer in the group", "在群里回应"], ["Put it on the record", "公开把话说出来"]],
  "Use a mediator": [["Use a mediator", "请人调解"], ["Ask a neutral person", "找中立的人"], ["Bring in the RA", "请 RA 介入"]],
  "Do the clean version": [["Do the clean version", "做干净版本"], ["Keep the record honest", "保留真实记录"], ["Fix it the right way", "按正确方式修"]],
  "Take the shortcut": [["Take the shortcut", "走捷径"], ["Hide the messy part", "藏起麻烦部分"], ["Use the convenient answer", "用方便答案"]],
  "Ask the instructor": [["Ask the instructor", "问老师"], ["Email the TA", "发邮件问助教"], ["Get an official answer", "要一个正式答案"]],
  "Wait until it is ready": [["Wait until it is ready", "准备好再发"], ["Hold it back", "先别发"], ["Polish before sending", "打磨后再交"]],
  "Send it now": [["Send it now", "现在发送"], ["Send the rough version", "发粗糙版本"], ["Take the opening", "先抓住机会"]],
  "Ask for a fast review": [["Ask for a fast review", "请人快审"], ["Get one quick pass", "请人快速过一遍"], ["Trade a favor for feedback", "用人情换反馈"]],
  "Speak up": [["Speak up", "站出来说"], ["Name the problem", "把问题说出来"], ["Make the public comment", "公开发言"]],
  "Ignore it": [["Ignore it", "先不管"], ["Save your energy", "省点精力"], ["Stay out of it", "不卷进去"]],
  "Build evidence": [["Build evidence", "整理证据"], ["Collect receipts", "收集凭据"], ["Make a careful case", "做成完整案例"]],
  "Be fully honest": [["Be fully honest", "如实说明"], ["Say the real thing", "说真实情况"], ["Let them see the mess", "让他们看到真实混乱"]],
  "Keep it polished": [["Keep it polished", "报喜不报忧"], ["Keep the call light", "让通话轻松点"], ["Show the clean version", "只展示顺利的一面"]],
  "Set a time to talk": [["Set a time to talk", "约时间聊"], ["Schedule the hard talk", "约个认真聊的时间"], ["Buy time without dodging", "争取时间但不逃避"]],
  "Save the cash": [["Save the cash", "先省钱"], ["Keep the budget intact", "保住预算"], ["Walk away from the deal", "先不买"]],
  "Buy the advantage": [["Buy the advantage", "买下优势"], ["Pay for the edge", "花钱换优势"], ["Invest in the tool", "投一笔工具钱"]],
  "Find a cheaper route": [["Find a cheaper route", "找便宜方案"], ["Hunt for a workaround", "找替代办法"], ["Negotiate the cost", "把价格谈下来"]],
  "Decline the role": [["Decline the role", "拒绝角色"], ["Step back", "退一步"], ["Pass the role on", "把角色让出去"]],
  "Lead it yourself": [["Lead it yourself", "自己带头"], ["Take command", "亲自接手"], ["Put your name on it", "用你的名字扛起来"]],
  "Share leadership": [["Share leadership", "共同负责"], ["Find a co-lead", "找共同负责人"], ["Split the authority", "把权力分出去"]]
};

const zhOutcomeLabel = {
  "You earn real understanding and burn through your evening.": "你真的弄懂了，也把整个晚上烧掉了。",
  "The work looks finished, but the weak spot stays alive.": "作业看起来完成了，薄弱点还活着。",
  "One good question saves more time than guessing.": "一个好问题比反复猜更省时间。",
  "You protect the work, but the night gets expensive.": "你保护了成果，但今晚会很累。",
  "The deadline survives, and the risk follows you.": "截止线保住了，风险也跟上来了。",
  "Clear rules steady the group before the damage spreads.": "清楚规则让小组稳住，没有继续出事。",
  "The room calms down, though the mood cools for a while.": "房间安静了，气氛也短暂冷下来。",
  "You feel included, then pay for it with your schedule.": "你更融入了，但日程开始付出代价。",
  "The shared rule costs effort and buys peace.": "共同规则费点劲，但买来平静。",
  "Your calendar breathes, but your budget tightens.": "日程松了一口气，预算变紧了。",
  "Money arrives fast and focus leaks away.": "钱来得很快，专注也流失得很快。",
  "You keep some income without handing over the week.": "你保留了一点收入，也没交出整周。",
  "Your grade path improves, and the club scrambles.": "成绩路线更稳，社团临时有点乱。",
  "People notice you, and your private workload swells.": "更多人看见你，你自己的工作量也膨胀。",
  "The task spreads out and your reputation quietly improves.": "任务分散出去，口碑悄悄变好。",
  "Your body catches up while ambition waits outside.": "身体追了上来，野心先在门外等着。",
  "Progress spikes, then your energy takes the hit.": "进度冲上去了，精力被狠狠扣下。",
  "A smaller plan keeps momentum without wrecking you.": "小一点的计划保住节奏，也没有透支你。",
  "The relationship gets clearer, but it costs emotional energy.": "关系更清楚了，但消耗了情绪。",
  "You win attention and lose trust in the same hour.": "你赢得了注意，也在同一小时失去信任。",
  "A third party slows the heat before it burns the week.": "第三方让火势降温，没烧完整周。",
  "The honest route is slower and much safer.": "诚实路线更慢，但安全得多。",
  "The shortcut looks smooth until someone asks how.": "捷径看起来顺，直到有人问它怎么来的。",
  "A clear answer costs pride and prevents a real mess.": "清楚答案伤一点面子，但阻止了大麻烦。",
  "You miss a window and keep your standards intact.": "你错过窗口，但保住标准。",
  "The opportunity moves, and the weak spots move with it.": "机会推进了，弱点也一起推进。",
  "Someone sharpens the pitch while you spend social capital.": "有人帮你打磨表达，你也花掉一些人情。",
  "The issue gets named, and you become visible.": "问题被说出来了，你也变得显眼。",
  "You save effort now and leave the system unchanged.": "你现在省了力，系统保持原样。",
  "A careful case has weight, but takes real time.": "仔细整理的论据有分量，也真的花时间。",
  "The conversation gets heavier and more real.": "对话变重了，也更真实。",
  "The call stays easy while the pressure stays yours.": "通话轻松过去，压力留在你身上。",
  "You create room without disappearing.": "你争取空间，也没有消失。",
  "The budget holds, and the useful thing slips away.": "预算稳住了，有用的东西也错过了。",
  "The tool helps immediately and thins the month.": "工具立刻有帮助，这个月也变薄了。",
  "You get part of the benefit without taking the full hit.": "你拿到部分好处，没有吃下全部代价。",
  "You stay sane and give up influence.": "你保住状态，也放弃了影响力。",
  "The project gains a center and your week loses one.": "项目有了中心，你的一周失去中心。",
  "A co-lead makes the work lighter and messier.": "共同负责让工作变轻，也变得更乱一点。"
};

const patternOptions = {
  study: [
    ["left", "Do the hard part first", "deep-work", "medium", "faith", "You earn real understanding and burn through your evening.", { faith: 18, military: -14, people: -4 }],
    ["right", "Patch the answer", "surface-fix", "high", "faith", "The work looks finished, but the weak spot stays alive.", { faith: -18, military: 12, people: 6 }],
    ["up", "Ask one precise question", "targeted-help", "low", "faith", "One good question saves more time than guessing.", { faith: 14, people: 4, military: -8 }]
  ],
  deadline: [
    ["left", "Rebuild it cleanly", "quality-investment", "medium", "faith", "You protect the work, but the night gets expensive.", { faith: 20, military: -18, people: -6 }],
    ["right", "Submit the shortcut", "deadline-shortcut", "high", "faith", "The deadline survives, and the risk follows you.", { faith: -22, military: 14, people: 8 }],
    ["up", "Ask for a boundary", "help-seeking", "low", "faith", "Clear rules steady the group before the damage spreads.", { faith: 12, military: -8, people: 6 }]
  ],
  dorm: [
    ["left", "Set a firm limit", "boundary-setting", "medium", "people", "The room calms down, though the mood cools for a while.", { people: -10, military: 18 }],
    ["right", "Go along with it", "social-bonding", "medium", "people", "You feel included, then pay for it with your schedule.", { people: 18, military: -18, faith: -8 }],
    ["down", "Negotiate a system", "coordination", "low", "people", "The shared rule costs effort and buys peace.", { people: 14, military: -8, wealth: -4 }]
  ],
  work: [
    ["left", "Protect your time", "capacity-protection", "low", "military", "Your calendar breathes, but your budget tightens.", { military: 18, wealth: -14 }],
    ["right", "Take the extra shift", "income-seeking", "medium", "wealth", "Money arrives fast and focus leaks away.", { wealth: 22, military: -18, faith: -8 }],
    ["up", "Take a smaller deal", "compromise", "low", "wealth", "You keep some income without handing over the week.", { wealth: 12, military: -8, people: 4 }]
  ],
  club: [
    ["left", "Choose class first", "academic-priority", "low", "faith", "Your grade path improves, and the club scrambles.", { faith: 18, people: -12 }],
    ["right", "Step into the spotlight", "visibility-seeking", "medium", "people", "People notice you, and your private workload swells.", { people: 20, faith: -14, military: -10 }],
    ["down", "Recruit help", "delegation", "low", "people", "The task spreads out and your reputation quietly improves.", { people: 14, faith: 8, military: -8 }]
  ],
  health: [
    ["left", "Recover properly", "recovery", "low", "military", "Your body catches up while ambition waits outside.", { military: 24, faith: -10 }],
    ["right", "Push through", "overextension", "high", "faith", "Progress spikes, then your energy takes the hit.", { faith: 16, military: -26 }],
    ["up", "Shrink the plan", "adaptive-planning", "low", "military", "A smaller plan keeps momentum without wrecking you.", { military: 14, faith: 8, people: -4 }]
  ],
  social: [
    ["left", "Talk privately", "repair", "low", "people", "The relationship gets clearer, but it costs emotional energy.", { people: 18, military: -10 }],
    ["right", "Make it public", "status-defense", "high", "people", "You win attention and lose trust in the same hour.", { people: -22, faith: 8, military: -6 }],
    ["down", "Use a mediator", "mediation", "medium", "people", "A third party slows the heat before it burns the week.", { people: 12, military: -6, faith: 4 }]
  ],
  ethics: [
    ["left", "Do the clean version", "integrity-protection", "medium", "faith", "The honest route is slower and much safer.", { faith: 22, military: -16, people: -6 }],
    ["right", "Take the shortcut", "integrity-risk", "high", "faith", "The shortcut looks smooth until someone asks how.", { faith: -26, people: 10, military: 8 }],
    ["up", "Ask the instructor", "accountability", "low", "faith", "A clear answer costs pride and prevents a real mess.", { faith: 16, people: 4, military: -8 }]
  ],
  career: [
    ["left", "Wait until it is ready", "quality-protection", "low", "faith", "You miss a window and keep your standards intact.", { faith: 12, wealth: -14, military: 8 }],
    ["right", "Send it now", "opportunity-risk", "medium", "wealth", "The opportunity moves, and the weak spots move with it.", { wealth: 20, faith: -16, military: -8 }],
    ["up", "Ask for a fast review", "network-seeking", "low", "wealth", "Someone sharpens the pitch while you spend social capital.", { wealth: 16, people: 8, military: -12 }]
  ],
  campus: [
    ["left", "Speak up", "civic-action", "medium", "people", "The issue gets named, and you become visible.", { people: 16, military: -10, wealth: -4 }],
    ["right", "Ignore it", "avoidance", "low", "military", "You save effort now and leave the system unchanged.", { military: 12, people: -14 }],
    ["up", "Build evidence", "evidence-building", "medium", "faith", "A careful case has weight, but takes real time.", { faith: 14, people: 10, military: -16 }]
  ],
  family: [
    ["left", "Be fully honest", "transparency", "medium", "people", "The conversation gets heavier and more real.", { people: 14, military: -12 }],
    ["right", "Keep it polished", "image-management", "medium", "military", "The call stays easy while the pressure stays yours.", { people: 8, military: -18 }],
    ["down", "Set a time to talk", "boundary-setting", "low", "military", "You create room without disappearing.", { military: 12, people: 8, faith: -4 }]
  ],
  money: [
    ["left", "Save the cash", "budget-protection", "low", "wealth", "The budget holds, and the useful thing slips away.", { wealth: 20, faith: -8, people: -4 }],
    ["right", "Buy the advantage", "resource-spending", "medium", "faith", "The tool helps immediately and thins the month.", { faith: 14, wealth: -22 }],
    ["up", "Find a cheaper route", "negotiation", "low", "wealth", "You get part of the benefit without taking the full hit.", { wealth: 10, faith: 8, military: -6 }]
  ],
  leadership: [
    ["left", "Decline the role", "scope-control", "low", "military", "You stay sane and give up influence.", { military: 18, people: -12, faith: 4 }],
    ["right", "Lead it yourself", "leadership-risk", "medium", "people", "The project gains a center and your week loses one.", { people: 20, military: -20, wealth: -6 }],
    ["up", "Share leadership", "collaboration", "low", "people", "A co-lead makes the work lighter and messier.", { people: 14, military: -10, faith: 6 }]
  ]
};

const rows = [
  ["study", "Mina from your project team", "classmate", "deadline", "Your midterm project is due in two days, and a teammate wants to stitch borrowed paragraphs into the report."],
  ["dorm", "Leo, your roommate", "roommate", "dorm", "A birthday party is starting in your dorm room, and you have an 8 a.m. lab tomorrow."],
  ["money", "Sam at the campus cafe", "barista", "work", "The cafe manager asks if you can take two extra closing shifts this week."],
  ["club", "Rui, student union lead", "club", "club", "The welcome booth needs a last-minute host, exactly when you planned to study for a quiz."],
  ["health", "Dr. Chen", "counselor", "health", "You have slept under five hours for three nights while everyone online posts their progress."],
  ["social", "Jay from seminar", "classmate", "social", "A class group chat thinks you took someone else's presentation slot, and the tone is getting sharp."],
  ["career", "Nora, a senior", "mentor", "career", "A strong internship closes tonight, but your application materials are still rough."],
  ["ethics", "Sam, the teaching assistant", "ta", "ethics", "One lab result looks strange, and your group wants to remove it from the chart."],
  ["campus", "The library desk", "librarian", "campus", "Someone is watching videos out loud in the silent area, and everyone nearby is pretending not to hear it."],
  ["family", "Your mom on video call", "parent", "family", "Your family wants you home this weekend, but your club interview is at the same time."],
  ["study", "Professor Avery", "professor", "leadership", "A professor recommends you for a research assistant role that requires ten hours every week."],
  ["dorm", "The floor RA", "ra", "dorm", "The shared kitchen is a disaster, and the RA wants every suite to join a cleaning rotation."],
  ["money", "A seller in the used-tech chat", "classmate", "money", "Someone is selling a tablet you wanted, right after your monthly budget got tight."],
  ["health", "Your running partner", "athlete", "health", "A friend wants an early morning run, but you studied very late last night."],
  ["social", "A classmate from another section", "classmate", "social", "You are invited into a study buddy group known for both great notes and constant anxiety."],
  ["club", "The debate captain", "captain", "club", "The debate team wants you to replace a speaker, and you know only half the topic."],
  ["career", "A career fair volunteer", "mentor", "career", "The recruiter line is long, and you only have twenty minutes before class."],
  ["ethics", "Yi, your friend", "classmate", "ethics", "A friend asks for last year's exam answers and says it is only for reference."],
  ["campus", "A student representative", "activist", "campus", "Dining services may shorten evening hours, and students are collecting responses."],
  ["family", "A family message thread", "parent", "family", "Your family suddenly asks about your class rank when you are not doing as well as usual."],
  ["study", "Your lab partner", "ta", "deadline", "Your lab partner gets sick, leaving you alone with the final experiment log."],
  ["dorm", "The laundry room group chat", "ra", "campus", "Residents are fighting about machines being left full for hours."],
  ["money", "The scholarship office", "advisor", "deadline", "A scholarship application closes at midnight and still needs a personal statement."],
  ["health", "The campus clinic", "medic", "health", "A headache has followed you all day, but your study plan says tonight is essential."],
  ["social", "Kai, your close friend", "classmate", "social", "A friend keeps arriving late to study sessions and has done it three times in a row."],
  ["club", "The film club producer", "artist", "leadership", "The short film lost its editor, and everyone looks at you because you know the software."],
  ["career", "An alumni mentor", "mentor", "career", "An alumnus can refer you, but wants a portfolio link by tomorrow morning."],
  ["ethics", "A course group DM", "classmate", "ethics", "An unreleased quiz screenshot appears in a private chat, and people start saving it."],
  ["campus", "The transit office", "activist", "campus", "Late shuttle service is unreliable, and students are gathering incident reports."],
  ["family", "Your older cousin", "parent", "family", "A cousin offers advice about your major and makes it sound like a warning."],
  ["study", "A writing tutor", "advisor", "deadline", "Your essay has a strong argument but no proper citations one night before submission."],
  ["dorm", "Your suite mate Priya", "roommate", "dorm", "A suite mate wants to host guests during quiet hours before finals."],
  ["money", "The bookstore cashier", "barista", "money", "The required textbook has an access code, and the new copy is painfully expensive."],
  ["health", "A meditation club member", "counselor", "health", "A mindfulness session starts during the only open block in your afternoon."],
  ["social", "A lab teammate", "classmate", "social", "A teammate keeps taking credit for your analysis during group updates."],
  ["club", "The dance crew lead", "captain", "club", "The showcase needs one more dancer, but rehearsal overlaps with tutoring."],
  ["career", "The startup founder", "founder", "work", "A student startup offers equity for a week of frantic design work."],
  ["ethics", "The statistics TA", "ta", "ethics", "Your model only looks good after excluding two uncomfortable data points."],
  ["campus", "The newspaper editor", "journalist", "campus", "The campus paper wants a student quote about a controversial fee increase."],
  ["family", "Your dad's voicemail", "parent", "family", "Your dad asks why you did not call back after a rough exam week."],
  ["study", "A capstone teammate", "coder", "leadership", "Your capstone team needs someone to merge the codebase before demo day."],
  ["dorm", "A neighbor downstairs", "roommate", "social", "A downstairs neighbor says your room is too loud, even though you were barely home."],
  ["money", "A local nonprofit", "activist", "leadership", "A nonprofit asks your club to run a fundraiser with almost no budget."],
  ["health", "The intramural captain", "athlete", "health", "Your team needs you for the playoffs, but your ankle still feels unstable."],
  ["social", "Someone you like", "artist", "social", "You want to ask a project partner to a campus exhibit without making teamwork awkward."],
  ["club", "The radio station", "journalist", "club", "The campus radio show needs a guest host after the original host loses their voice."],
  ["career", "A recruiter on email", "mentor", "career", "A recruiter asks for an updated resume by the end of the day."],
  ["ethics", "A class poll", "classmate", "ethics", "People want to vote on whether to report a group that copied slides."],
  ["campus", "The dining hall manager", "barista", "campus", "The dining hall tests reusable containers but asks students to manage returns."],
  ["family", "Your sibling", "parent", "family", "Your sibling asks for help with their college essay during your exam week."],
  ["study", "Your seminar professor", "professor", "deadline", "A seminar presentation needs one clearer argument before tomorrow morning."],
  ["dorm", "The fire safety inspector", "ra", "campus", "Several rooms are using banned space heaters after the building gets cold."],
  ["money", "A paid research lab", "professor", "work", "A lab offers paid participant recruiting work during your busiest week."],
  ["health", "The counseling center", "counselor", "health", "A counselor has one appointment slot left, right when your group wants to meet."],
  ["social", "A study partner", "classmate", "social", "Your study partner jokes about your grade in front of other people."],
  ["club", "The coding club", "coder", "leadership", "The hackathon team needs a project manager more than another programmer."],
  ["career", "A portfolio reviewer", "advisor", "career", "Your portfolio looks impressive but lacks explanation for your actual role."],
  ["ethics", "The honor council notice", "advisor", "ethics", "An honor council training asks students to report ambiguous collaboration cases."],
  ["campus", "The accessibility office", "advisor", "campus", "A classroom building has a broken elevator, and affected students need signatures."],
  ["family", "Your aunt at dinner", "parent", "family", "A relative keeps comparing your major to a cousin's salary."],
  ["study", "A project client", "founder", "deadline", "A class client asks for a new feature one day before delivery."],
  ["dorm", "Your roommate group chat", "roommate", "dorm", "Everyone wants to split the cost of a mini fridge you barely plan to use."],
  ["money", "The financial aid portal", "advisor", "money", "A small emergency grant opens, and you worry someone else may need it more."],
  ["health", "A nutrition peer coach", "medic", "health", "You have been skipping meals to save time, and a peer coach notices."],
  ["social", "A quiet classmate", "classmate", "social", "A quiet classmate asks to join your project group after teams are already set."],
  ["club", "The art collective", "artist", "club", "The mural team wants you to paint all weekend before a Monday critique."],
  ["career", "A fellowship advisor", "advisor", "deadline", "A fellowship draft is due tonight, and your statement still sounds generic."],
  ["ethics", "A teammate's GitHub commit", "coder", "ethics", "A teammate pushes code copied from a tutorial without attribution."],
  ["campus", "The student senate", "activist", "campus", "Student senate debates whether to fund a late-night safety escort program."],
  ["family", "Your family calendar", "parent", "family", "A family celebration lands on the same day as your final project demo."],
  ["study", "A math forum post", "classmate", "club", "A class forum asks about a problem you finally solved after hours."],
  ["dorm", "The bathroom sign-up sheet", "ra", "dorm", "The shared bathroom keeps running out of supplies, and nobody admits using the last of them."],
  ["money", "A student maker booth", "founder", "money", "A classmate sells handmade prints that you genuinely like but cannot easily afford."],
  ["health", "The rec center", "athlete", "health", "The rec center opens a climbing class, exactly during your best study block."],
  ["social", "Your group chat", "classmate", "social", "A joke you posted lands badly, and two people stop replying."],
  ["club", "The orchestra manager", "captain", "club", "The campus orchestra needs someone to turn pages for a concert tonight."],
  ["career", "A design professor", "professor", "career", "A professor says your case study needs ruthless editing before it can help you."],
  ["ethics", "A peer review form", "ta", "ethics", "You must grade a teammate who barely contributed but is going through a hard week."],
  ["campus", "The sustainability office", "activist", "campus", "The sustainability office wants student volunteers for a compost pilot."],
  ["family", "Your grandparents", "parent", "family", "Your grandparents want a long weekend visit, and travel costs are not small."],
  ["study", "The exam review room", "ta", "deadline", "A review session reveals you misunderstood a topic that will be on tomorrow's exam."],
  ["dorm", "The package room", "ra", "campus", "Packages are piling up because students keep missing pickup windows."],
  ["money", "Your bank app", "advisor", "money", "Your spending report shows delivery food has quietly eaten the month."],
  ["health", "A sleep workshop flyer", "counselor", "health", "A sleep workshop promises help, but the timing feels inconvenient."],
  ["social", "A former friend", "classmate", "social", "A former friend asks to talk after months of awkward silence."],
  ["club", "The campus magazine", "journalist", "club", "The magazine wants your essay about burnout under your real name."],
  ["career", "A mock interview coach", "mentor", "career", "Your mock interview goes well until the coach asks for a leadership example."],
  ["ethics", "The citation audit", "ta", "ethics", "The TA flags unclear citations in your project and asks for sources."],
  ["campus", "The app feedback team", "coder", "campus", "The campus app crashes during course registration, and IT wants detailed reports."],
  ["family", "Your family group chat", "parent", "family", "Your family asks why you did not share photos from a campus award ceremony."],
  ["study", "A thesis advisor", "professor", "deadline", "Your thesis question is too broad, and the advisor suggests starting over."],
  ["dorm", "Your suite", "roommate", "dorm", "The suite wants a shared snack shelf after food keeps disappearing."],
  ["money", "A club sponsor", "founder", "money", "A local company offers sponsorship if your event displays their logo."],
  ["health", "The rainy track", "athlete", "health", "The rain stops and the track looks inviting, but the surface is slick."],
  ["social", "A graduate student table", "mentor", "social", "At a research dinner, everyone talks above your level and you feel invisible."],
  ["club", "The board game club", "club", "leadership", "Board game club needs a rules host for an event you did not plan to run."],
  ["career", "The alumni panel", "mentor", "career", "An alumni panel ends with a chance to introduce yourself to someone important."],
  ["ethics", "The exam answer rumor", "professor", "ethics", "The professor warns that last year's answers have been circulating."],
  ["campus", "The open study room", "librarian", "campus", "Students ask to keep a building open overnight during finals."],
  ["family", "A graduation photo notice", "parent", "family", "Graduation photos conflict with your final project rehearsal."],
  ["study", "A peer tutor", "advisor", "deadline", "A peer tutor says your final draft needs deeper revision than you expected."],
  ["dorm", "The hallway bulletin board", "ra", "campus", "Someone posts anonymous complaints about room cleanliness on the hall board."],
  ["money", "A rent reminder", "advisor", "money", "Next month's housing payment arrives earlier than you planned."],
  ["health", "A flu-season email", "medic", "health", "A flu-season email says to rest at first symptoms, and your throat is starting to hurt."],
  ["social", "A new transfer student", "classmate", "social", "A transfer student asks to join your lunch table when everyone is mid-conversation."],
  ["club", "The theater director", "artist", "club", "The theater director asks you to manage props after another volunteer quits."],
  ["career", "A job board alert", "mentor", "career", "A job board alert matches your dream role but asks for a tailored cover letter today."],
  ["ethics", "A tutoring request", "ta", "ethics", "A student you tutor asks you to look at a take-home exam before they submit it."],
  ["campus", "The bike-share team", "activist", "campus", "Bike-share stations are empty near the dorms, and students want usage data collected."],
  ["family", "Your family budget chat", "parent", "family", "Your family hints that they can help with money if you explain the problem clearly."],
  ["study", "A lab safety quiz", "ta", "deadline", "The safety quiz locks tonight, and your notes are scattered across three apps."],
  ["dorm", "A roommate's partner", "roommate", "dorm", "A roommate's partner has been staying over so often that it changes the whole room."],
  ["money", "A campus repair shop", "coder", "money", "Your laptop battery is failing, and the repair quote is higher than expected."],
  ["health", "A campus therapist", "counselor", "health", "You notice you have been avoiding every message that asks how you are."],
  ["social", "The debate afterparty", "captain", "social", "An afterparty could help you bond with the team, but it runs late before a morning quiz."],
  ["club", "The volunteer coordinator", "activist", "leadership", "A service event needs someone to coordinate transportation across campus."],
  ["career", "A professor's recommendation", "professor", "career", "A professor can write a recommendation but asks for your materials by noon."],
  ["ethics", "A shared spreadsheet", "coder", "ethics", "A shared spreadsheet includes private survey responses that should not be public."],
  ["campus", "The safety walk team", "activist", "campus", "Students organize a safety walk after several poorly lit paths are reported."],
  ["family", "A homesick call", "parent", "family", "Someone at home says they miss you and asks whether college has changed you."],
  ["study", "A group presentation", "classmate", "deadline", "Your group presentation is tomorrow, and the slides still look like four separate projects."],
  ["dorm", "The quiet floor", "ra", "dorm", "The quiet floor wants stricter rules after two noisy weekends in a row."],
  ["money", "A meal-plan booth", "barista", "money", "A meal-plan upgrade promises convenience but locks in a large payment."],
  ["health", "A campus marathon sign-up", "athlete", "health", "A half-marathon team needs one more runner, and you have not trained enough."],
  ["social", "A class Discord", "coder", "social", "A class Discord starts mocking a student who asked a basic question."],
  ["club", "The entrepreneurship club", "founder", "leadership", "The entrepreneurship club wants you to pitch an idea you barely believe in."],
  ["career", "A career coach", "advisor", "career", "A career coach says your LinkedIn looks impressive but unfocused."],
  ["ethics", "The group contract", "ta", "ethics", "A group contract lets you remove a nonresponsive teammate before grading."],
  ["campus", "The garden committee", "activist", "campus", "A campus garden project needs students to defend its budget at an open meeting."],
  ["family", "A parent weekend invitation", "parent", "family", "Parent weekend overlaps with your first public performance on campus."],
  ["study", "The final review packet", "ta", "deadline", "The final review packet is huge, and you only have one clean evening left."],
  ["dorm", "A broken thermostat", "ra", "campus", "The dorm thermostat is broken, and everyone argues about whether to escalate it."],
  ["money", "A freelance client", "founder", "work", "A freelance client offers quick cash for a poster due tomorrow."],
  ["health", "The campus lake path", "athlete", "health", "A friend wants a long walk to reset after a hard week, but your inbox is full."],
  ["social", "A friend in crisis", "counselor", "social", "A friend sends a late-night message that sounds more serious than usual."],
  ["club", "The cultural fair team", "artist", "club", "The cultural fair team needs someone to staff a booth during your study block."],
  ["career", "An interview invitation", "mentor", "career", "An interview invitation arrives for a time that conflicts with an important lecture."],
  ["ethics", "A course archive", "librarian", "ethics", "A course archive contains old assignments that look too close to this year's prompts."],
  ["campus", "The printer queue", "librarian", "campus", "The library printer queue is broken during finals, and students are panicking."],
  ["family", "A family health update", "parent", "family", "A family health update makes you want to go home, but finals start tomorrow."]
];

const expansionScenarioGroups = {
  study: [
    ["A composition TA", "ta", "deadline", "Your essay reads smoothly because an AI outline shaped half of it, and the draft is due tonight.", "你的论文因为用了 AI 提纲而顺了很多，但今晚就要交了。"],
    ["A statistics classmate", "classmate", "study", "The problem set has one impossible question, and your group wants to split the answer without checking it.", "习题集中有一道题大家都不会，小组想先分答案交上去。"],
    ["Professor Lin", "professor", "leadership", "Professor Lin invites you to present early findings in class, even though your data is still thin.", "林教授邀请你在课上展示初步发现，但你的数据还很薄。"],
    ["A sleepy lab section", "ta", "deadline", "Your lab section discovers the pre-lab quiz closes in forty minutes.", "你的实验班突然发现预习测验还有四十分钟就关闭。"],
    ["Your thesis group", "coder", "leadership", "Your thesis group cannot agree on a research question, and the proposal deadline is moving closer.", "你的论文小组迟迟定不下研究问题，而开题截止时间越来越近。"],
    ["A visiting scholar", "professor", "career", "A visiting scholar pauses after your question and asks if you want to talk after the lecture.", "访问学者听完你的提问后停了一下，问你讲座后要不要继续聊。"],
    ["The language center", "advisor", "study", "The language center offers a feedback slot, but it overlaps with your only free dinner.", "语言中心有一个反馈名额，但正好占掉你唯一能好好吃饭的时间。"],
    ["Your chemistry partner", "classmate", "ethics", "Your chemistry partner suggests copying the safety notes from last year's shared folder.", "化学搭档建议直接复制去年共享文件夹里的安全说明。"],
    ["A peer tutor", "advisor", "study", "A peer tutor tells you the answer is right but your reasoning would not survive office hours.", "同伴导师说你的答案对了，但推理经不起答疑时间追问。"],
    ["The exam seating chart", "ta", "social", "The exam seating chart places you next to someone who keeps asking for hints.", "考试座位表把你安排在一个总想要提示的人旁边。"],
    ["A seminar rival", "classmate", "social", "A seminar rival challenges your point, and the room goes quiet.", "研讨课上一个对手质疑你的观点，教室突然安静下来。"],
    ["The lab equipment room", "librarian", "campus", "The equipment room has one camera left, and another team claims they booked it first.", "器材室只剩一台相机，另一组说他们先预约了。"],
    ["The grade portal", "ta", "study", "The grade portal shows a score that seems too low, but the appeal window closes tomorrow.", "成绩系统显示的分数明显偏低，但申诉窗口明天就关。"],
    ["A lecture recording", "professor", "money", "A paid note-sharing site offers the lecture recording your professor never posted.", "付费笔记网站有你教授没上传的课堂录音。"],
    ["The final study room", "classmate", "dorm", "Your study room booking is missing, and the desk says no rooms are open.", "你的自习室预约不见了，前台说已经没有空房间。"],
    ["A course assistant", "ta", "ethics", "The course assistant quietly warns that your project looks too similar to another team's.", "课程助教私下提醒你，你们的项目和另一组太像了。"]
  ],
  social: [
    ["A new club friend", "classmate", "social", "A new friend invites you to a late dinner just as your study block begins.", "新认识的朋友约你吃很晚的晚饭，而你的学习时间刚开始。"],
    ["The residence group chat", "roommate", "social", "A sarcastic comment about you gets a dozen reactions before you can answer.", "宿舍群里一句关于你的阴阳怪气评论已经收获了一排反应。"],
    ["Your lab crush", "artist", "social", "Your lab crush asks if you want to pair up again, and your current partner is standing there.", "实验课上你有好感的人问要不要再组队，而你现在的搭档就站在旁边。"],
    ["An old high school friend", "classmate", "family", "An old friend visits campus and expects the whole evening, but you promised your group a draft.", "高中旧友来学校找你，默认你整个晚上都空着，但你答应小组今晚交稿。"],
    ["The group project chat", "classmate", "leadership", "The group chat goes silent after you ask who actually finished their part.", "你问谁真的完成了自己的部分后，小组群突然沉默。"],
    ["A roommate's apology", "roommate", "dorm", "Your roommate apologizes for the mess and asks if you can stop telling people about it.", "室友为弄乱房间道歉，同时希望你别再和别人提这件事。"],
    ["A campus influencer", "journalist", "social", "A campus influencer asks to repost your funny rant about the dining hall.", "一位校园博主想转发你吐槽食堂的搞笑动态。"],
    ["A lonely classmate", "classmate", "health", "A classmate says they have not made friends yet and asks to tag along this weekend.", "一位同学说自己还没交到朋友，问周末能不能跟你一起活动。"],
    ["The debate afterchat", "captain", "social", "The debate team keeps replaying your mistake as a joke.", "辩论队反复把你的失误当笑话讲。"],
    ["A partner for office hours", "classmate", "study", "Someone asks to go to office hours with you, but they never prepare questions.", "有人想和你一起去答疑，但每次都不提前准备问题。"],
    ["The photo tag", "journalist", "social", "Someone tags you in a party photo your family group can see.", "有人在一张家人也看得到的派对照片里标记了你。"],
    ["A friend with gossip", "classmate", "ethics", "A friend tells you a rumor that could hurt someone applying for the same internship.", "朋友告诉你一个传闻，可能会伤到和你申请同一实习的人。"],
    ["A quiet apology", "classmate", "social", "The person who ignored you for weeks asks to sit together before the midterm.", "一个冷落你好几周的人在期中前问能不能一起坐。"],
    ["The cafeteria table", "barista", "social", "Your usual table saves a seat for you, but another group waves you over.", "你常坐的那桌给你留了座，另一群人也在向你招手。"],
    ["A late-night message", "counselor", "health", "A friend sends 'are you awake?' after midnight and then deletes it.", "朋友半夜发来一句“你醒着吗”，又很快撤回。"],
    ["A roommate vote", "roommate", "dorm", "Your roommates vote on a house rule while you are away.", "室友们趁你不在时投票决定了一条宿舍规则。"]
  ],
  club: [
    ["The photography club", "artist", "club", "Photography club needs you to cover an event, but the only lens left is half broken.", "摄影社需要你去拍活动，但剩下的镜头有一半坏了。"],
    ["A student sponsor", "founder", "money", "A sponsor offers your club money if their logo appears on every slide.", "赞助方愿意给社团经费，但要求每页幻灯片都出现他们的 logo。"],
    ["The volunteer fair", "activist", "leadership", "The volunteer fair is understaffed, and the coordinator asks you to run check-in alone.", "志愿者集市人手不足，负责人让你一个人负责签到。"],
    ["The theater group", "artist", "club", "The theater group loses a lead actor, and someone says you know all the lines.", "剧社主角临时退出，有人说你其实记得所有台词。"],
    ["The music room key", "captain", "dorm", "Your club's music room key goes missing after you were the last one inside.", "社团音乐室钥匙不见了，而你是最后一个进去的人。"],
    ["The coding club server", "coder", "ethics", "A coding club server contains old hackathon templates that would save your team hours.", "技术社服务器里有旧黑客松模板，能帮你们省好几个小时。"],
    ["The art market", "artist", "money", "Your club can sell prints at the art market, but the booth fee is due today.", "社团可以在艺术市集卖作品，但摊位费今天就要交。"],
    ["The club election", "club", "leadership", "A club election has no serious candidate, and people start writing your name in.", "社团选举没有靠谱候选人，大家开始把你的名字写上去。"],
    ["A rehearsal room", "captain", "campus", "Two clubs booked the same rehearsal room, and both events start in ten minutes.", "两个社团预约了同一间排练室，两个活动十分钟后都要开始。"],
    ["The club treasurer", "advisor", "money", "The club treasurer asks you to approve a receipt that looks vague.", "社团财务让你批准一张写得很模糊的收据。"],
    ["A visiting performer", "artist", "career", "A visiting performer offers backstage passes if your club can promote the show hard.", "一位来访表演者说，如果社团大力宣传演出，就给后台通行证。"],
    ["The poster wall", "journalist", "campus", "Your club's posters keep getting covered by a bigger organization's flyers.", "你们社团海报总被一个更大组织的传单盖住。"],
    ["The charity auction", "activist", "club", "The charity auction needs a flashy item, and someone suggests auctioning your tutoring hours.", "慈善拍卖缺一个吸引人的项目，有人建议拍卖你的辅导时间。"],
    ["The esports team", "captain", "health", "The esports team wants one more scrim tonight, but your eyes already ache.", "电竞队今晚还想再打一轮训练赛，但你的眼睛已经酸了。"],
    ["The campus dance floor", "athlete", "social", "Your club asks you to teach a dance you only learned from a video.", "社团让你教一支你只从视频里学过的舞。"],
    ["The student expo", "founder", "leadership", "The student expo gives your club a prime slot, if you can rewrite the demo by morning.", "学生展给了你们社团黄金时段，前提是你明早前重写演示。"]
  ],
  dorm: [
    ["The hallway microwave", "ra", "dorm", "The hallway microwave smells burnt, and everyone insists it was not their food.", "走廊微波炉一股焦味，所有人都说不是自己的东西。"],
    ["A surprise guest", "roommate", "dorm", "Your roommate's friend arrives with a suitcase and no checkout date.", "室友的朋友拖着行李箱来了，而且没说什么时候走。"],
    ["The quiet-hours sign", "ra", "dorm", "The RA asks residents to sign a stricter quiet-hours pledge before finals.", "期末前，RA 要大家签一份更严格的安静时段承诺。"],
    ["The shower drain", "ra", "campus", "The shower drain floods again, and maintenance says they need more reports.", "淋浴间下水口又堵了，维修说需要更多报修记录。"],
    ["A roommate's alarm", "roommate", "dorm", "A roommate's alarm rings for twenty minutes every morning.", "室友的闹钟每天早上响二十分钟。"],
    ["The shared fridge", "roommate", "money", "The shared fridge is full of unlabeled food right before inspection.", "检查前，共用冰箱里塞满了没有标记的食物。"],
    ["The laundry thief", "ra", "social", "Someone keeps moving your laundry out before the cycle ends.", "有人总是在洗衣程序结束前就把你的衣服挪出来。"],
    ["The room temperature", "roommate", "health", "Your roommate wants the room freezing cold, and you keep waking up sick.", "室友想把房间开得很冷，而你总是醒来不舒服。"],
    ["The move-out boxes", "parent", "family", "Your family wants to ship your move-out boxes early, but you still need half the things.", "家人想提前寄走你的搬家箱子，但里面一半东西你还要用。"],
    ["The broken elevator", "ra", "campus", "The dorm elevator stops working during move-in week.", "搬入周宿舍电梯突然坏了。"],
    ["A hallway rumor", "roommate", "social", "A hallway rumor says your suite is the reason the RA is tightening rules.", "走廊传言说 RA 收紧规定都是因为你们套间。"],
    ["The bathroom rota", "ra", "dorm", "The bathroom cleaning rota has your name twice this week.", "浴室清洁轮值表上这周你的名字出现了两次。"],
    ["The window leak", "ra", "campus", "Rain leaks through your window onto your laptop case.", "雨水从窗边漏进来，滴到你的电脑包上。"],
    ["A neighbor's pet", "roommate", "dorm", "A neighbor secretly keeps a pet that barks during your online exams.", "邻居偷偷养的宠物在你线上考试时一直叫。"],
    ["The package mix-up", "ra", "money", "Your package is marked delivered, but the package room says someone else signed.", "你的包裹显示已送达，但收发室说是别人签收的。"],
    ["A winter break sublet", "roommate", "money", "A roommate proposes subletting the room over break to cover rent.", "室友提议假期把房间短租出去来补房租。"]
  ],
  money: [
    ["The emergency grant", "advisor", "money", "An emergency grant could cover your laptop repair, but the form asks for uncomfortable details.", "一项紧急补助能覆盖电脑维修费，但表格要求填写很私人的细节。"],
    ["A campus sale", "barista", "money", "A campus sale offers the winter coat you need at half price for one day.", "校园折扣一天内半价卖你正需要的冬衣。"],
    ["The group dinner bill", "classmate", "social", "A group dinner bill gets split evenly, although you ordered the cheapest thing.", "聚餐账单被平均分摊，尽管你点的是最便宜的东西。"],
    ["A paid survey", "advisor", "money", "A paid survey pays well, but asks for data you would rather keep private.", "一份有偿问卷报酬不错，但要求提供你不太想给的数据。"],
    ["The parking ticket", "advisor", "money", "A parking ticket appears on your account after you borrowed a friend's car.", "你借朋友车后，账户里突然出现一张停车罚单。"],
    ["A textbook rental", "librarian", "study", "The library can rent you the textbook, but only for four hours at a time.", "图书馆可以借给你教材，但每次只能借四小时。"],
    ["A meal swipe request", "classmate", "social", "A classmate asks for one of your meal swipes near the end of the month.", "月底时，一位同学想借用你的一次餐卡额度。"],
    ["The subscription renewal", "coder", "money", "A software subscription renews tomorrow, and you only use it for one class.", "一个软件订阅明天续费，而你只在一门课里用它。"],
    ["The campus job board", "mentor", "work", "A job board lists a weekend gig that pays well but overlaps with your review session.", "校园兼职板上有个周末高薪工作，但和你的复习课冲突。"],
    ["The scholarship thank-you", "advisor", "family", "A scholarship asks for a donor thank-you letter while you are behind on homework.", "奖学金要求写给捐赠人的感谢信，而你作业已经落后。"],
    ["A friend's fundraiser", "activist", "money", "A friend's fundraiser reaches out just after you promised yourself to stop spending.", "你刚决定暂停花钱，朋友的筹款链接就发来了。"],
    ["The club reimbursement", "club", "money", "Your club reimbursement is delayed because the receipt is missing one line.", "你的社团报销因为收据少了一行信息被拖住。"],
    ["A used bike", "athlete", "money", "A used bike would save commute time, but it needs repairs you cannot price yet.", "一辆二手车能省通勤时间，但维修费用还不清楚。"],
    ["The printing balance", "librarian", "study", "Your printing balance runs out the night before a paper portfolio is due.", "纸质作品集截止前一晚，你的打印余额用完了。"],
    ["A rent split change", "roommate", "dorm", "A roommate wants to change the rent split because their room is smaller.", "室友因为房间更小，想重新分摊房租。"],
    ["A family money call", "parent", "family", "Your family asks whether you are short on money, and you have been avoiding the answer.", "家人问你是不是缺钱，而你一直在回避回答。"]
  ],
  health: [
    ["The campus flu", "medic", "health", "Half your floor is coughing, and you wake up with chills before a quiz.", "半层楼都在咳嗽，你小测前醒来还发冷。"],
    ["A midnight coffee", "barista", "health", "The cafe offers free midnight coffee during finals week.", "期末周咖啡店提供免费的午夜咖啡。"],
    ["The counseling waitlist", "counselor", "health", "The counseling waitlist opens one cancellation slot during your busiest class.", "心理咨询候补名单空出一个名额，但正好在你最忙的一节课。"],
    ["A gym challenge", "athlete", "health", "Your friends start a gym challenge with daily check-ins.", "朋友们发起了一个每天打卡的健身挑战。"],
    ["The migraine warning", "medic", "health", "Your screen headache returns whenever you open the final project.", "你一打开最终项目，屏幕引发的头痛就回来。"],
    ["A messy sleep schedule", "counselor", "study", "Your sleep schedule flips so badly that breakfast feels like dinner.", "你的作息乱到早餐像晚餐。"],
    ["The meal prep plan", "barista", "money", "A meal-prep plan would save money, but Sunday is already packed.", "备餐计划能省钱，但周日已经排满了。"],
    ["The campus lake run", "athlete", "social", "A running group invites you to a sunrise loop around the lake.", "跑步小组邀请你日出时绕湖跑一圈。"],
    ["A panic before lab", "counselor", "health", "Your hands start shaking before a lab practical you studied for.", "你明明复习过实验实操，考前手还是开始发抖。"],
    ["The sick roommate", "roommate", "dorm", "Your roommate is sick but refuses to wear a mask in the room.", "室友生病了，却不愿在房间里戴口罩。"],
    ["The injury waiver", "athlete", "ethics", "The intramural team asks you to sign a waiver and play through a sore wrist.", "院队让你签免责书，带着酸痛的手腕继续上场。"],
    ["A mental-health post", "journalist", "social", "A classmate posts something worrying and then turns off comments.", "一位同学发了条让人担心的动态，随后关掉了评论。"],
    ["The clinic bill", "medic", "money", "The clinic can see you today, but the visit may cost more than expected.", "校医院今天能看你，但费用可能比预想更高。"],
    ["The meditation streak", "counselor", "health", "Your meditation streak hits thirty days, right when finals chaos starts.", "你的冥想连续打卡到三十天，正好撞上期末混乱。"],
    ["The food allergy label", "barista", "ethics", "A cafeteria label looks wrong for a dish your friend is allergic to.", "食堂一道菜的过敏原标签看起来不对，而你朋友正好对它过敏。"],
    ["A fever before demo day", "medic", "health", "You wake with a fever on demo day after choosing to push through yesterday.", "你昨天硬撑之后，在演示日当天发烧醒来。"]
  ],
  career: [
    ["A conference mentor", "mentor", "career", "A mentor asks for your research summary after you asked a sharp conference question.", "你在会议上问了个好问题后，一位导师想看你的研究摘要。"],
    ["A cold email draft", "mentor", "career", "Your cold email draft sounds brave but slightly desperate.", "你的冷邮件草稿很勇敢，但也有点急切。"],
    ["A recruiter coffee chat", "mentor", "social", "A recruiter offers a coffee chat at the exact time of your group rehearsal.", "招聘方约你咖啡聊聊，时间正好撞上小组彩排。"],
    ["A portfolio typo", "advisor", "career", "You notice a typo on the first page of the portfolio you already sent.", "你发现已经发出的作品集第一页有个错字。"],
    ["A career workshop", "advisor", "career", "A career workshop promises resume feedback but requires missing club practice.", "职业工作坊承诺简历反馈，但要你缺席社团训练。"],
    ["A reference request", "professor", "career", "A professor agrees to be a reference if you send a polished summary tonight.", "教授愿意做推荐人，前提是你今晚发一份打磨好的总结。"],
    ["A startup demo", "founder", "work", "A startup wants you to demo their app for visiting investors.", "一家创业团队想让你给来访投资人演示他们的 App。"],
    ["A case interview", "mentor", "study", "A case interview practice group starts using problems you have never seen.", "案例面试练习组开始做你从没见过的题。"],
    ["A paid internship lead", "mentor", "career", "A senior offers a paid internship lead but asks you not to share it widely.", "学长学姐给你一个有薪实习线索，但希望你别广泛转发。"],
    ["A job fair badge", "journalist", "campus", "Your job fair badge prints the wrong major.", "招聘会胸牌把你的专业印错了。"],
    ["A recommendation deadline", "professor", "deadline", "A recommendation portal closes tonight, and your recommender says they forgot.", "推荐信系统今晚关闭，而推荐人说自己忘了。"],
    ["A design test", "founder", "work", "A company sends a design test that looks a lot like unpaid client work.", "一家公司发来的设计测试看起来很像无偿客户项目。"],
    ["A networking promise", "mentor", "social", "You promised to introduce two people, but one privately warns they do not want it.", "你答应介绍两个人认识，但其中一人私下说并不想被介绍。"],
    ["A grad-school panel", "professor", "career", "A graduate-school panel makes your current plan feel suddenly small.", "一场研究生项目分享会让你当前的计划突然显得很小。"],
    ["An interview outfit", "parent", "money", "Your only interview outfit needs tailoring before next week.", "你唯一的面试衣服下周前需要修改。"],
    ["A second interview", "mentor", "career", "The company asks for a second interview and wants details you exaggerated in the first.", "公司邀请你二面，并追问你一面里夸大的细节。"]
  ],
  ethics: [
    ["The AI draft review", "ta", "ethics", "The writing center asks how much of your essay outline came from AI.", "写作中心问你的论文提纲有多少来自 AI。"],
    ["A shared solution doc", "coder", "ethics", "A shared solution doc has answers for the exact homework due tonight.", "共享文档里有今晚作业的完整答案。"],
    ["A rumor screenshot", "journalist", "ethics", "A rumor you repeated appears in a screenshot sent to the person involved.", "你转述过的传闻被截图发给了当事人。"],
    ["The lab log timestamp", "ta", "ethics", "Your lab log timestamp shows an edit after the deadline.", "你的实验记录时间戳显示截止后还有修改。"],
    ["A housing complaint", "ra", "dorm", "Housing asks for your side of the overnight guest dispute.", "宿舍管理处要求你说明过夜访客争议的经过。"],
    ["Financial aid review", "advisor", "money", "Financial aid asks for clarification on your emergency grant form.", "资助办公室要求你解释紧急补助表格里的信息。"],
    ["A quote without context", "journalist", "campus", "The campus paper wants to use your quote, but it removes the cautious part.", "校园报想引用你的话，却删掉了你谨慎的那半句。"],
    ["A confidential spreadsheet", "coder", "ethics", "A club spreadsheet includes phone numbers that should not be public.", "社团表格里有不该公开的手机号。"],
    ["A peer review secret", "classmate", "ethics", "A teammate asks what score you gave them in a confidential peer review.", "队友问你在匿名互评里给了他多少分。"],
    ["The attendance loophole", "classmate", "ethics", "A classmate finds a way to mark attendance without entering the room.", "同学发现了不用进教室也能签到的方法。"],
    ["A clinic note", "medic", "ethics", "Someone asks to borrow your clinic note to excuse their own absence.", "有人想借你的校医院证明来解释自己的缺勤。"],
    ["The exam seating whisper", "ta", "ethics", "During an exam, someone whispers the formula you forgot.", "考试时，有人低声说出了你忘记的公式。"],
    ["A professor's draft", "professor", "ethics", "A professor accidentally uploads tomorrow's quiz draft.", "教授不小心上传了明天测验的草稿。"],
    ["The survey prize", "advisor", "ethics", "A survey prize form asks you to confirm responses you never checked.", "问卷抽奖表让你确认一些你从没检查过的回答。"],
    ["A borrowed ID", "roommate", "ethics", "A roommate asks to borrow your student ID for a dining hall entry.", "室友想借你的学生卡进食堂。"],
    ["An honor review notice", "advisor", "ethics", "The honor office opens a review because your explanation does not match the draft history.", "荣誉办公室因为你的解释和草稿记录不一致而启动审查。"]
  ],
  campus: [
    ["Student senate agenda", "activist", "campus", "Student senate adds your club's branded sponsor deal to the agenda.", "学生议会把你们社团的品牌赞助交易加入议程。"],
    ["Campus safety desk", "ra", "campus", "Campus safety asks why your event crowd plan changed at the last minute.", "校园安全办公室询问你们活动的人流方案为什么临时改变。"],
    ["The maintenance thread", "ra", "campus", "Your maintenance complaint becomes the example in a building-wide email.", "你的维修投诉被写进了全楼邮件里的案例。"],
    ["The account hold", "advisor", "money", "A purchase dispute puts a temporary hold on your campus account.", "一次消费争议让你的校园账户被临时冻结。"],
    ["The clinic policy email", "medic", "campus", "The clinic emails a reminder after several students miss urgent appointments.", "多名学生错过紧急预约后，校医院发出提醒邮件。"],
    ["A networking follow-up", "mentor", "career", "The person you promised to introduce asks why the message never came.", "你答应要介绍的人问为什么消息一直没来。"],
    ["The honor meeting room", "advisor", "ethics", "An honor review asks you to bring every draft of the assignment.", "荣誉审查要求你带上那份作业的所有草稿。"],
    ["The survey data hearing", "activist", "campus", "Student government asks you to explain how private survey data leaked.", "学生会要求你说明私人问卷数据是怎么泄露的。"],
    ["A shuttle route vote", "activist", "campus", "A shuttle route vote pits commuters against residents.", "校车路线投票让通勤学生和住宿学生站到对立面。"],
    ["A dining hall pilot", "barista", "campus", "A dining hall pilot needs students to scan returns, and the line is already angry.", "食堂试点要求学生扫码归还，排队的人已经很不满。"],
    ["The data request", "coder", "campus", "Administrators ask for the usage data you promised to collect.", "管理人员要求你提交之前承诺收集的使用数据。"],
    ["A financial planning meeting", "advisor", "money", "Financial aid invites you and your family to a planning meeting.", "资助办公室邀请你和家人参加一次财务规划会议。"],
    ["A public comment", "journalist", "campus", "Your public comment gets quoted in a campus-wide newsletter.", "你的公开发言被校园通讯引用。"],
    ["The library noise policy", "librarian", "campus", "The library considers banning group calls after complaints spike.", "投诉激增后，图书馆考虑禁止小组通话。"],
    ["The printers again", "librarian", "campus", "The printer queue fails for a second day, and the help desk asks for volunteers.", "打印队列第二天又坏了，服务台开始招志愿者帮忙。"],
    ["A protest permit", "activist", "campus", "A protest permit is approved for the same quad as a campus tour.", "抗议许可被批准在校园参观团同一个广场举行。"]
  ],
  family: [
    ["A parent text", "parent", "family", "A parent asks why your reply sounded colder than usual.", "家长问你为什么这次回复听起来比平时冷淡。"],
    ["A sibling favor", "parent", "family", "Your sibling needs a ride from campus just as your office hours begin.", "你的兄弟姐妹需要你从学校接人，而你的答疑时间刚开始。"],
    ["A family video call", "parent", "family", "A family video call turns into a debate about whether you study enough.", "家庭视频通话变成了你到底够不够努力的辩论。"],
    ["A holiday ticket", "parent", "money", "A holiday ticket gets more expensive every hour you wait.", "回家的假期票价每等一小时都在上涨。"],
    ["A family secret", "parent", "social", "A relative shares family news and asks you not to tell your parents yet.", "亲戚告诉你一个家庭消息，并让你先别告诉父母。"],
    ["A homesick afternoon", "counselor", "health", "You hear a song from home and lose the rest of the afternoon.", "你听到一首家乡的歌，整个下午都被牵走了。"],
    ["A parent weekend schedule", "parent", "club", "Your family wants the full parent-weekend schedule, but you have not told them about the performance.", "家人想要完整的家长周末安排，但你还没告诉他们有演出。"],
    ["A family budget spreadsheet", "parent", "money", "A family budget spreadsheet arrives with a line labeled 'your campus costs'.", "家里的预算表发来，其中一行写着“你的校园开销”。"],
    ["A cousin's internship", "parent", "career", "A cousin lands a famous internship, and the family chat turns to your plans.", "表亲拿到知名实习后，家庭群开始聊你的规划。"],
    ["A grandparent call", "parent", "family", "A grandparent calls during your exam review and says they just wanted to hear you.", "祖父母在你复习考试时打来电话，说只是想听听你的声音。"],
    ["A family health ride", "parent", "health", "A family member needs a ride to an appointment during your lab practical.", "家人需要你在实验实操时段送去就诊。"],
    ["A parent email", "parent", "study", "A parent emails your advisor asking how you are doing.", "家长给你的导师发邮件询问你的近况。"],
    ["A holiday argument", "parent", "social", "A holiday argument from home follows you back into the semester.", "假期里的家庭争吵一路跟着你回到新学期。"],
    ["A family celebration", "parent", "club", "A family celebration is planned for the same night as your club's final event.", "家庭庆祝活动安排在你社团最终活动的同一晚。"],
    ["A care package", "parent", "dorm", "A care package arrives with enough snacks to make your roommates stare.", "家里寄来的关怀包里零食多到让室友都盯着看。"],
    ["A boundary follow-up", "parent", "family", "Your family circles back to the boundary talk and asks what you actually need.", "家人又回到那次边界谈话，问你到底需要什么。"]
  ]
};

const expansionRows = Object.entries(expansionScenarioGroups).flatMap(([domainKey, entries]) =>
  entries.map(([speaker, portrait, pattern, prompt, promptZh]) => ({
    domainKey,
    speaker,
    portrait,
    pattern,
    prompt,
    promptZh
  }))
);

const generatedCampusIngredients = {
  actors: [
    ["A first-year roommate", "roommate", "大一室友"],
    ["The course TA", "ta", "课程助教"],
    ["A student club treasurer", "club", "社团财务同学"],
    ["Your academic advisor", "advisor", "学业导师"],
    ["An intramural teammate", "athlete", "院队队友"],
    ["The late-night cafe lead", "barista", "深夜咖啡店负责人"],
    ["The residence hall RA", "ra", "宿舍 RA"],
    ["A quiet classmate", "classmate", "安静的同班同学"],
    ["A visiting professor", "professor", "访问教授"],
    ["An alumni mentor", "mentor", "校友导师"],
    ["The campus newspaper editor", "journalist", "校园报编辑"],
    ["A studio collaborator", "artist", "工作室搭档"],
    ["A hackathon teammate", "coder", "黑客松队友"],
    ["A student organizer", "activist", "学生组织者"],
    ["The library circulation desk", "librarian", "图书馆借还台"],
    ["A campus clinic nurse", "medic", "校医院护士"],
    ["The debate captain", "captain", "辩论队队长"],
    ["A student founder", "founder", "学生创业者"],
    ["A wellness counselor", "counselor", "身心健康咨询师"],
    ["A family member on the phone", "parent", "电话里的家人"]
  ],
  situations: [
    ["study", "deadline", "a half-finished assignment depends on one source nobody can verify", "一份半成品作业依赖一个没人能核实的来源"],
    ["study", "study", "a review sheet reveals a topic you thought you understood is still shaky", "复习资料显示你以为懂了的主题其实还不稳"],
    ["dorm", "dorm", "a shared-space rule breaks down right before finals week", "公共空间规则在期末周前突然失效"],
    ["dorm", "social", "a roommate conflict spills into the floor group chat", "室友冲突蔓延到了楼层群聊"],
    ["money", "money", "a useful campus purchase would drain the rest of the month", "一笔有用的校园消费会掏空这个月剩余预算"],
    ["money", "work", "a paid shift appears exactly when your hardest class needs attention", "一个有薪班次正好撞上最难课程需要投入的时候"],
    ["health", "health", "your body sends a warning sign during a week everyone calls decisive", "在大家都说很关键的一周里，身体发出了警告"],
    ["health", "study", "rest would help, but the next checkpoint is tomorrow morning", "休息会有帮助，但下一个检查点就在明早"],
    ["social", "social", "a private misunderstanding becomes visible to people you care about", "一个私人误会被你在意的人看见了"],
    ["social", "dorm", "keeping the peace would mean accepting a boundary you dislike", "维持和气意味着接受一个你不喜欢的边界"],
    ["club", "club", "a club event loses a key person and everyone looks toward you", "社团活动失去关键人手，所有人都看向你"],
    ["club", "leadership", "taking the visible role would help the group and overload your week", "接下显眼角色会帮到团队，也会压垮这一周"],
    ["career", "career", "an opportunity asks for polished self-presentation faster than feels honest", "一个机会要求你比真实准备程度更快地展示自己"],
    ["career", "deadline", "a mentor opens a door that closes before you can fully prepare", "导师打开了一扇门，但它在你完全准备好前就会关上"],
    ["ethics", "ethics", "a shortcut looks normal because several classmates already used it", "一个捷径看起来很普通，因为好几个同学已经用了"],
    ["ethics", "deadline", "the clean version takes longer than the official deadline allows", "干净做法需要的时间超过了正式截止时间"],
    ["campus", "campus", "a campus policy problem needs student evidence before anyone acts", "一个校园政策问题需要学生证据才会有人行动"],
    ["campus", "leadership", "a public comment could improve the system and make you the face of the issue", "一次公开发言可能改善系统，也会让你成为议题代表"],
    ["family", "family", "family expectations arrive during the narrowest part of the semester", "家庭期待在学期最窄的缝隙里出现"],
    ["family", "money", "being honest with family could unlock help and invite judgment", "对家人坦诚可能带来帮助，也可能带来评价"]
  ],
  twists: [
    ["after two nights of poor sleep", "在连续两晚没睡好之后"],
    ["while your group is waiting for an answer", "当小组正在等你的答复时"],
    ["with a scholarship deadline nearby", "在奖学金截止日期临近时"],
    ["right after a tense message exchange", "在一场紧张消息交流之后"],
    ["when your budget is already thin", "当你的预算已经很薄时"],
    ["during the only open block in your calendar", "在你日程里唯一空出来的时段"],
    ["before a meeting with someone influential", "在见一个有影响力的人之前"],
    ["while people are comparing progress online", "当大家都在网上比较进度时"],
    ["after you promised to be more available", "在你承诺会更常出现之后"],
    ["as a small mistake starts becoming public", "当一个小错误开始变得公开时"]
  ]
};

function makeGeneratedCampusRows(targetCount) {
  const generated = [];
  const seenPrompts = new Set([...rows, ...expansionRows].map((row) => Array.isArray(row) ? row[4] : row.prompt));
  let cursor = 0;

  while (generated.length + rows.length + expansionRows.length < targetCount) {
    const actor = generatedCampusIngredients.actors[cursor % generatedCampusIngredients.actors.length];
    const situation = generatedCampusIngredients.situations[Math.floor(cursor / generatedCampusIngredients.actors.length) % generatedCampusIngredients.situations.length];
    const twist = generatedCampusIngredients.twists[Math.floor(cursor / (generatedCampusIngredients.actors.length * generatedCampusIngredients.situations.length)) % generatedCampusIngredients.twists.length];
    const prompt = `${actor[0]} brings up ${situation[2]} ${twist[0]}.`;

    if (!seenPrompts.has(prompt)) {
      seenPrompts.add(prompt);
      generated.push({
        domainKey: situation[0],
        speaker: actor[0],
        portrait: actor[1],
        pattern: situation[1],
        prompt,
        promptZh: `${actor[2]}提起：${situation[3]}，而且${twist[1]}。`
      });
    }

    cursor += 1;
  }

  return generated;
}

const generatedRows = makeGeneratedCampusRows(1000);
const allRows = [...rows, ...expansionRows, ...generatedRows];

function soulTagsFor(domainKey, pattern) {
  const tags = new Set(["COG"]);
  if (["social", "dorm", "family"].includes(domainKey) || ["social", "dorm"].includes(pattern)) tags.add("CONV");
  if (["campus", "social", "club"].includes(domainKey)) tags.add("SS");
  if (["club", "leadership", "career", "family"].includes(domainKey) || pattern === "leadership") tags.add("ROLE");
  if (["ethics", "deadline", "money", "campus"].includes(pattern) || ["ethics", "money", "campus"].includes(domainKey)) tags.add("EVAL");
  return [...tags];
}

function failureModesFor(domainKey, pattern) {
  const modes = new Set();
  if (["ethics", "deadline"].includes(pattern) || domainKey === "ethics") modes.add("integrity-or-shortcut-risk");
  if (["social", "dorm", "family"].includes(domainKey)) modes.add("relationship-trust-risk");
  if (["health", "work", "leadership"].includes(pattern) || domainKey === "health") modes.add("overload-and-energy-risk");
  if (["money", "career"].includes(domainKey)) modes.add("resource-and-opportunity-risk");
  if (domainKey === "campus" || pattern === "campus") modes.add("public-systems-risk");
  return [...modes];
}

function withFollowUp(number, direction, option) {
  const followUp = followUps[`${number}:${direction}`];
  return followUp ? { ...option, followUp } : option;
}

function makeOption(number, raw) {
  const [direction, text, decisionType, riskLevel, targetMeter, label, effect] = raw;
  const textVariants = optionTextVariants[text] ?? [[text, zhOptionText[text] ?? text]];
  const [displayText, displayTextZh] = textVariants[(number + direction.length) % textVariants.length];

  return withFollowUp(number, direction, {
    direction,
    text: displayText,
    textZh: displayTextZh,
    decisionType,
    riskLevel,
    targetMeter,
    expectedValue: Math.max(...Object.values(effect)) >= 20 ? "swingy" : "medium",
    probabilityType: riskLevel === "high" ? "volatile" : "stable",
    outcomes: [
      {
        chance: 1,
        label,
        labelZh: zhOutcomeLabel[label] ?? label,
        effects: effect
      }
    ]
  });
}

const portraitSpeakerZh = {
  roommate: "室友",
  ta: "课程助教",
  club: "社团负责人",
  advisor: "校园导师",
  athlete: "运动搭子",
  barista: "咖啡店同学",
  ra: "楼层 RA",
  classmate: "同班同学",
  professor: "教授",
  mentor: "学长学姐",
  journalist: "校园记者",
  artist: "艺术社同学",
  coder: "技术社同学",
  activist: "学生代表",
  librarian: "图书馆老师",
  medic: "校医院老师",
  captain: "队长",
  founder: "创业同学",
  counselor: "心理咨询师",
  parent: "家人"
};

const speakerZhOverrides = {
  "Mina from your project team": "项目队友 Mina",
  "Leo, your roommate": "室友 Leo",
  "Sam at the campus cafe": "咖啡店同学 Sam",
  "Rui, student union lead": "学生会负责人 Rui",
  "Dr. Chen": "陈老师",
  "Jay from seminar": "研讨课同学 Jay",
  "Nora, a senior": "学姐 Nora",
  "Sam, the teaching assistant": "课程助教 Sam",
  "The library desk": "图书馆服务台",
  "Your mom on video call": "妈妈的视频电话",
  "Professor Avery": "Avery 教授",
  "The floor RA": "楼层 RA",
  "Yi, your friend": "朋友 Yi",
  "Kai, your close friend": "好友 Kai"
};

const domainPromptZh = {
  Academics: "学业压力",
  "Social Life": "人际关系",
  Clubs: "社团事务",
  Dorm: "宿舍生活",
  Money: "预算安排",
  Wellbeing: "身心状态",
  Career: "职业机会",
  Integrity: "诚信边界",
  Campus: "校园公共事务",
  Family: "家庭沟通"
};

function speakerZhFor(speaker, portrait) {
  return speakerZhOverrides[speaker] ?? portraitSpeakerZh[portrait] ?? "校园同学";
}

const promptZhByNumber = {
  1: "你的期中项目还有两天截止，一位队友想把借来的段落拼进报告里。",
  2: "宿舍里有人准备办生日派对，而你明早有 8 点实验课。",
  3: "咖啡店经理问你这周能不能多接两个打烊班。",
  4: "迎新摊位临时缺主持人，而那正好是你准备小测的时间。",
  5: "你已经连续三晚睡不到五小时，而网上大家都在晒自己的进度。",
  6: "班级群觉得你抢了别人的展示名额，语气越来越冲。",
  7: "一个不错的实习今晚截止，但你的申请材料还很粗糙。",
  8: "一组实验结果看起来很异常，你的小组想把它从图表里删掉。",
  9: "有人在图书馆安静区外放视频，旁边的人都假装没听见。",
  10: "家人希望你周末回家，但你的社团面试也安排在同一时间。",
  11: "一位教授推荐你参加研究助理项目，但每周需要固定十小时。",
  12: "公共厨房一团糟，楼层 RA 想让每个套间加入清洁轮值。",
  13: "有人正在二手数码群卖你想要的平板，而你的月度预算刚好吃紧。",
  14: "朋友约你清晨跑步，但你昨晚学习到很晚。",
  15: "有人邀请你加入学习搭子群，这个群以资料多和焦虑多同时出名。",
  16: "辩论队想让你替补上场，但你只准备了一半题目。",
  17: "招聘摊位前排起长队，而你离上课只剩二十分钟。",
  18: "朋友问你要去年的考试答案，并说只是参考一下。",
  19: "餐饮服务可能缩短晚餐供应时间，学生代表正在收集意见。",
  20: "家人突然问你的班级排名，而你最近状态其实并不好。",
  21: "你的实验搭档生病了，最终实验记录只剩你一个人整理。",
  22: "洗衣机被占用好几个小时，住户们正在群里争吵。",
  23: "一份奖学金申请午夜截止，但还缺个人陈述。",
  24: "头痛跟了你一整天，但你的学习计划说今晚非常关键。",
  25: "朋友已经连续三次在自习约定中迟到。",
  26: "短片项目失去了剪辑，所有人都看向会软件的你。",
  27: "一位校友可以内推你，但希望你明早前发作品集链接。",
  28: "一张未公开测验截图出现在私聊里，大家开始保存它。",
  29: "晚间校车不稳定，学生们正在收集事故记录。",
  30: "一位表亲给你专业建议，但听起来更像警告。",
  31: "你的论文观点很强，但提交前一晚还没有规范引用。",
  32: "一位套间室友想在期末前的安静时段接待客人。",
  33: "必修教材带访问码，新书价格高得让人心疼。",
  34: "一场正念活动正好安排在你下午唯一空出来的时间。",
  35: "一位队友在小组汇报时不断把你的分析说成自己的功劳。",
  36: "展示需要再加一名舞者，但排练时间和你的辅导冲突。",
  37: "一个学生创业项目用股权换你一周高强度设计工作。",
  38: "你的模型只有在排除两个尴尬数据点后才显得好看。",
  39: "校园报想让学生就一项有争议的费用上涨发表看法。",
  40: "父亲留言问你为什么考试周过得很糟时没有回电话。",
  41: "你的毕业项目小组需要有人在演示日前合并代码库。",
  42: "楼下邻居说你房间太吵，尽管你那时几乎不在宿舍。",
  43: "一家非营利组织请你的社团在几乎没有预算的情况下办筹款活动。",
  44: "队伍需要你参加季后赛，但你的脚踝仍然不稳。",
  45: "你想约项目搭档去校园展览，又担心让合作气氛变尴尬。",
  46: "校园广播节目原主持人失声，需要一位临时嘉宾主持。",
  47: "招聘方要求你今天结束前发一份更新后的简历。",
  48: "大家想投票决定是否举报一个复制幻灯片的小组。",
  49: "食堂试行可重复使用餐盒，但要求学生负责归还管理。",
  50: "你的兄弟姐妹在你考试周请你帮忙改大学申请文书。",
  51: "明早的研讨课展示还需要一个更清楚的核心论点。",
  52: "天气变冷后，几间宿舍开始使用违规取暖器。",
  53: "一个实验室在你最忙的一周提供有偿招募参与者的工作。",
  54: "心理咨询中心只剩一个预约时段，而你的小组也想在那时开会。",
  55: "你的自习搭子当着别人开你成绩的玩笑。",
  56: "黑客松队伍现在更需要项目经理，而不是另一个程序员。",
  57: "你的作品集看起来很亮眼，但没有说明你实际负责了什么。",
  58: "荣誉委员会培训要求学生报告边界模糊的合作情况。",
  59: "一栋教学楼电梯坏了，受影响的同学需要签名支持。",
  60: "一位亲戚不断把你的专业和表亲的薪水作比较。",
  61: "课程客户在交付前一天要求增加一个新功能。",
  62: "室友群想一起分摊迷你冰箱费用，但你几乎不打算用。",
  63: "一项小额紧急补助开放申请，而你担心别人可能更需要。",
  64: "你为了省时间一直跳过吃饭，一位同伴教练注意到了。",
  65: "一位安静的同学想加入你们项目组，但队伍已经分好了。",
  66: "壁画小组希望你整个周末都去画画，而你周一有作品评审。",
  67: "奖学金草稿今晚截止，但你的陈述仍然很泛泛。",
  68: "一位队友提交了从教程复制来的代码，却没有标注来源。",
  69: "学生议会在讨论是否资助夜间安全护送项目。",
  70: "一场家庭庆祝活动和你的最终项目演示撞在同一天。",
  71: "课程论坛有人问到一道你花了好几个小时才弄懂的题。",
  72: "公共卫生间总是缺用品，却没人承认用了最后一份。",
  73: "同学在摊位卖你真心喜欢的手工印刷品，但你并不太买得起。",
  74: "健身中心开设攀岩课，正好占掉你最好的学习时段。",
  75: "你发的一个玩笑反应很差，两个人开始不回消息。",
  76: "校园管弦乐团今晚需要有人在演出时帮忙翻谱。",
  77: "一位教授说你的案例研究必须大幅删改，才可能对求职有帮助。",
  78: "你必须评价一位几乎没贡献的队友，但对方最近过得很艰难。",
  79: "可持续发展办公室想招学生志愿者参与堆肥试点。",
  80: "祖父母想让你周末回去住几天，但路费并不便宜。",
  81: "复习课让你发现自己误解了明天考试会考的一个主题。",
  82: "包裹因为大家错过取件时间而堆满了收发室。",
  83: "你的消费报告显示，外卖正在悄悄吃掉这个月的预算。",
  84: "睡眠工作坊承诺能帮上忙，但时间安排让你很不方便。",
  85: "一位曾经的朋友在几个月尴尬沉默后想找你聊聊。",
  86: "校园杂志想以你的真名刊登一篇关于倦怠的文章。",
  87: "模拟面试一开始很顺，直到教练要求你举一个领导力例子。",
  88: "助教指出你们项目里有几处引用不清，并要求提供来源。",
  89: "选课注册时校园 App 崩溃了，信息技术部门需要详细反馈。",
  90: "家人问你为什么没有分享校园获奖仪式的照片。",
  91: "你的论文问题太宽泛，导师建议你重新开始。",
  92: "食物不断消失后，套间想设一个共享零食架。",
  93: "一家本地公司愿意赞助活动，但要求展示他们的 logo。",
  94: "雨停后跑道看起来很诱人，但地面仍然很滑。",
  95: "研究晚餐上大家都在聊你听不太懂的话题，你感觉自己很隐形。",
  96: "桌游社需要一位规则主持人，而你本来没打算负责这场活动。",
  97: "校友分享会结束后，你有机会向一位重要的人介绍自己。",
  98: "教授提醒大家，去年的答案正在流传。",
  99: "期末期间，学生们请求让一栋楼通宵开放。",
  100: "毕业照时间和你的最终项目彩排冲突。",
  101: "同伴导师说你的终稿需要比预想更深入的修改。",
  102: "有人在楼层公告板上匿名抱怨房间卫生。",
  103: "下个月房租提醒比你计划得更早到来。",
  104: "流感季邮件建议一有症状就休息，而你的喉咙开始疼了。",
  105: "一位转学生在大家聊到一半时问能不能加入你们的午餐桌。",
  106: "另一位志愿者退出后，戏剧导演请你管理道具。",
  107: "职位提醒匹配到你的理想工作，但今天就要定制求职信。",
  108: "你辅导的一名学生想让你在提交前看看他的居家考试。",
  109: "宿舍附近的共享单车站总是空的，学生们想收集使用数据。",
  110: "家人暗示如果你清楚说明问题，他们可以在钱上帮忙。",
  111: "安全测验今晚锁定，而你的笔记分散在三个应用里。",
  112: "室友的伴侣留宿得太频繁，已经改变了整个房间的状态。",
  113: "你的笔记本电池快不行了，维修报价比预想更高。",
  114: "你发现自己一直在回避所有问你近况的消息。",
  115: "辩论赛后的聚会能帮你和队伍熟悉，但它会拖到早晨小测前很晚。",
  116: "一次服务活动需要有人协调跨校区交通。",
  117: "教授可以给你写推荐信，但要求中午前收到材料。",
  118: "共享表格里包含了不该公开的私人问卷回答。",
  119: "几条照明不足的小路被报告后，学生们组织安全步行检查。",
  120: "家里有人说想你了，并问大学是不是改变了你。",
  121: "你们明天要做小组展示，但幻灯片看起来像四个独立项目。",
  122: "安静楼层在连续两个吵闹周末后想制定更严格规则。",
  123: "餐饮计划升级很方便，但需要一次性锁定一大笔付款。",
  124: "半程马拉松队还缺一名跑者，而你训练得不够。",
  125: "班级 Discord 开始嘲笑一位问基础问题的学生。",
  126: "创业社想让你推介一个你自己都不太相信的点子。",
  127: "职业教练说你的 LinkedIn 看起来亮眼但重点分散。",
  128: "小组合同允许你在评分前移除一位长期不回应的队友。",
  129: "校园花园项目需要学生在公开会议上为预算辩护。",
  130: "家长周末和你第一次公开校园表演撞期。",
  131: "期末复习资料包很大，而你只剩一个完整晚上。",
  132: "宿舍恒温器坏了，大家在争论要不要升级投诉。",
  133: "一位自由职业客户愿意为明天到期的海报支付快钱。",
  134: "朋友想在艰难的一周后去湖边长走重置状态，但你的收件箱爆满。",
  135: "朋友深夜发来的消息听起来比平时严重得多。",
  136: "文化节团队需要有人在你的学习时段看摊。",
  137: "一份面试邀请的时间和一堂重要课程冲突。",
  138: "课程档案里有旧作业，和今年的题目看起来太接近了。",
  139: "期末期间图书馆打印队列坏了，学生们开始慌张。",
  140: "家里的健康消息让你想回家，但明天就开始期末考试。"
};

function makeCard(row, index) {
  const [domainKey, speaker, portrait, pattern, prompt, promptZhFromTuple] = Array.isArray(row)
    ? row
    : [row.domainKey, row.speaker, row.portrait, row.pattern, row.prompt, row.promptZh];
  const number = index + 1;
  const domain = domains[domainKey];
  const speakerZh = speakerZhFor(speaker, portrait);

  return {
    id: `campus-${String(number).padStart(3, "0")}`,
    number,
    domain,
    speaker,
    speakerZh,
    portrait,
    prompt,
    promptZh: promptZhFromTuple ?? promptZhByNumber[number] ?? `${domainPromptZh[domain] ?? "校园情境"}：${speakerZh}带来一个需要你权衡的决定。`,
    options: patternOptions[pattern].map((raw) => makeOption(number, raw)),
    soulTags: soulTagsFor(domainKey, pattern),
    failureModes: failureModesFor(domainKey, pattern),
    isFollowUp: followUpNumbers.has(number)
  };
}

export const cards = allRows.map(makeCard);

export const cardById = new Map(cards.map((item) => [item.id, item]));
