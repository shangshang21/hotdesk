export const productionPolicy={
  version:'reader-first-v1',
  platforms:['toutiao','penguin','baijiahao'],
  objective:'读者利益切入、真实反差、有材料的分歧、图文解释；交付人工复制粘贴与上传的完整包',
  scope:'不固定领域或年龄，不自动发布，不承诺流量；平台模板是待验证的编辑假设，不代表已知推荐算法；用户明确指定时可减少平台',
  profiles:{
    toutiao:{template:'conflict',promise:'迅速看懂反差和争议',structure:'结果前置 → 关键细节 → 真实分歧 → 开放问题'},
    penguin:{template:'story',promise:'理解人物或事件的变化',structure:'可核实场景 → 前因 → 关键选择 → 后果；不编造人物心理'},
    baijiahao:{template:'explanation',promise:'弄明白一个具体问题',structure:'问题前置 → 证据 → 原因拆解 → 影响边界'}
  },
  freshness:'必须指出新事件、新数据或新进展；旧材料标明时间，不能换成“刚刚”制造时效',
  length:'按信息需要控制长度；优先短段与具体例子，不设固定长文日更产量',
  images:'按封面、解释、结果选择真实相关图，通常每平台1–3张；不足可少用，不凑9张，不用裁剪/换文件名规避检测',
  completion:'正文与 collect_image 配图就绪后再审稿；新增图片须重新审稿；export_publish_pack 返回 ready_for_handoff 才表示三平台稿件及配图齐备；仍待人工确认',
  limits:{toutiao_title:30},
};

export const strategyInstructions={
  editor:'填写 reader_entry：这次新增了什么、目标读者是谁、具体利益/处境是什么、依据来源、已有内容未回答的问题。名人知名度只作辅助，不能把大人物普通表态自动判为S级。',
  research:'有因果推演时填写 causal_chains 和 scenarios；每个箭头列机制、事实依据、缺口。情景必须包含前提、观察指标及失效条件，不能省略库存/替代/渠道/时间滞后；不能用免责声明代替证据。无资料则留空，不强凑。',
  opinion:'分歧按真实样本组织，可以是两派、三方利益或待回答问题，不强制二选一，不制造对立阵营。',
  angles:'每个角度填写 reader_promise、core_contrast、template、fulfillment：标题承诺读者得到什么，正文哪段兑现，材料支持的反差在哪里。新进展与旧背景分清；点击来自具体问题和真实细节，不故意隐藏关键主体或夸大范围。',
  write:'默认按 production_policy 写头条/企鹅/百家三版；围绕不同读者问题重新组织标题、开头、信息顺序和重点，不只换同义词。差异化服务于阅读体验和真实数据测试，不以 SimHash/pHash 阈值、所谓平台固定权重或“防风控”猜测为目标。标题有事实/观点依据，头条标题按项目设置不超过30字符。标题、开头、正文兑现同一承诺；句中分析不能夹带新事实。资料扎实、表达轻，字数随信息需要。',
  review:'额外检查读者承诺是否兑现、时效边界、因果链条件、图片场景归属及三版内容增量。合格的分歧不等于制造骂战；不按 SimHash/pHash 阈值声称平台认可原创或保证流量，也不把未经可靠来源证实的推荐权重或算法参数当成审稿依据。'
};
