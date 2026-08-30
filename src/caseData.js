const caseLibrary = Object.freeze([
  { company: "美团", role: "测试开发实习", profile: "双非大一", result: "获得实习录用", group: "internet", industry: "互联网" },
  { company: "美团", role: "产品运营实习", profile: "商科转型", result: "获得转正机会", group: "internet", industry: "互联网" },
  { company: "美团", role: "商业分析实习", profile: "985 统计学本科", result: "获得暑期实习", group: "internet", industry: "互联网" },
  { company: "美团", role: "用户研究实习", profile: "心理学硕士", result: "获得实习录用", group: "internet", industry: "互联网" },
  { company: "美团", role: "后台开发校招", profile: "211 计算机硕士", result: "获得校招 offer", group: "internet", industry: "互联网" },
  { company: "京东", role: "采销实习", profile: "211 本科", result: "获得暑期实习", group: "internet", industry: "互联网" },
  { company: "京东", role: "产品经理实习", profile: "985 硕士", result: "获得实习录用", group: "internet", industry: "互联网" },
  { company: "京东", role: "数据分析实习", profile: "海外本科", result: "获得暑期实习", group: "internet", industry: "互联网" },
  { company: "京东", role: "供应链运营实习", profile: "工业工程本科", result: "获得实习录用", group: "internet", industry: "互联网" },
  { company: "京东", role: "技术产品校招", profile: "双非硕士", result: "获得校招 offer", group: "internet", industry: "互联网" },
  { company: "得物", role: "电商运营实习", profile: "市场营销本科", result: "获得实习录用", group: "internet", industry: "互联网" },
  { company: "得物", role: "用户增长实习", profile: "统计学本科", result: "获得暑期实习", group: "internet", industry: "互联网" },
  { company: "得物", role: "商品策略实习", profile: "服装管理本科", result: "获得实习录用", group: "internet", industry: "互联网" },
  { company: "得物", role: "商业分析校招", profile: "海外商科硕士", result: "获得校招 offer", group: "internet", industry: "互联网" },
  { company: "网易", role: "游戏策划实习", profile: "普通本科", result: "获得首段大厂实习", group: "internet", industry: "互联网" },
  { company: "网易", role: "内容运营实习", profile: "传媒专业本科", result: "获得实习录用", group: "internet", industry: "互联网" },
  { company: "网易", role: "用户研究实习", profile: "社会学硕士", result: "获得暑期实习", group: "internet", industry: "互联网" },
  { company: "网易", role: "后端开发校招", profile: "211 软件工程", result: "获得校招 offer", group: "internet", industry: "互联网" },
  { company: "字节跳动", role: "产品经理实习", profile: "985 硕士", result: "获得暑期实习", group: "internet", industry: "互联网" },
  { company: "字节跳动", role: "数据分析实习", profile: "211 经济学", result: "获得实习录用", group: "internet", industry: "互联网" },
  { company: "字节跳动", role: "商业化运营实习", profile: "双非硕士", result: "获得实习录用", group: "internet", industry: "互联网" },
  { company: "字节跳动", role: "推荐算法校招", profile: "985 人工智能硕士", result: "获得校招 offer", group: "internet", industry: "互联网" },
  { company: "滴滴", role: "策略运营实习", profile: "985 统计学本科", result: "获得暑期实习", group: "internet", industry: "互联网" },
  { company: "滴滴", role: "数据产品实习", profile: "211 金融工程", result: "获得实习录用", group: "internet", industry: "互联网" },
  { company: "滴滴", role: "用户增长实习", profile: "双非本科", result: "获得首段互联网实习", group: "internet", industry: "互联网" },
  { company: "滴滴", role: "后台开发实习", profile: "计算机硕士", result: "获得暑期实习", group: "internet", industry: "互联网" },
  { company: "快手", role: "商业化运营实习", profile: "双非硕士", result: "获得实习录用", group: "internet", industry: "互联网" },
  { company: "快手", role: "内容策略实习", profile: "中文系本科", result: "完成跨专业转型", group: "internet", industry: "互联网" },
  { company: "快手", role: "前端开发校招", profile: "普通本科", result: "获得校招 offer", group: "internet", industry: "互联网" },
  { company: "阿里巴巴", role: "电商产品实习", profile: "海外本科", result: "获得实习录用", group: "internet", industry: "互联网" },
  { company: "阿里巴巴", role: "用户运营实习", profile: "市场营销本科", result: "获得暑期实习", group: "internet", industry: "互联网" },
  { company: "阿里巴巴", role: "数据开发实习", profile: "211 计算机硕士", result: "获得实习录用", group: "internet", industry: "互联网" },

  { company: "宝洁", role: "品牌管理实习", profile: "985 商科硕士", result: "获得暑期实习", group: "consumer", industry: "消费品" },
  { company: "联合利华", role: "客户发展实习", profile: "211 本科", result: "获得暑期实习", group: "consumer", industry: "消费品" },
  { company: "欧莱雅", role: "数字营销实习", profile: "海外本科", result: "获得实习录用", group: "consumer", industry: "消费品" },
  { company: "雀巢", role: "供应链实习", profile: "工业工程本科", result: "获得实习录用", group: "consumer", industry: "消费品" },
  { company: "玛氏", role: "销售管培生", profile: "双非硕士", result: "获得管培生 offer", group: "consumer", industry: "消费品" },
  { company: "可口可乐", role: "品类分析实习", profile: "211 经济学", result: "获得暑期实习", group: "consumer", industry: "消费品" },
  { company: "百事", role: "市场营销实习", profile: "普通本科", result: "获得实习录用", group: "consumer", industry: "消费品" },
  { company: "伊利", role: "产品管培生", profile: "食品科学硕士", result: "获得校招 offer", group: "consumer", industry: "消费品" },
  { company: "蒙牛", role: "渠道管理校招", profile: "双非本科", result: "获得校招 offer", group: "consumer", industry: "消费品" },
  { company: "安踏", role: "商品运营实习", profile: "服装管理本科", result: "获得实习录用", group: "consumer", industry: "消费品" },
  { company: "耐克", role: "零售规划实习", profile: "海外商科硕士", result: "获得暑期实习", group: "consumer", industry: "消费品" },
  { company: "宜家", role: "电商运营校招", profile: "211 本科", result: "获得校招 offer", group: "consumer", industry: "消费品" },
  { company: "美的", role: "产品企划校招", profile: "工业设计硕士", result: "获得产品岗位录用", group: "consumer", industry: "消费品" },

  { company: "中金公司", role: "投行实习", profile: "985 金融硕士", result: "获得暑期实习", group: "business", industry: "金融" },
  { company: "中信证券", role: "行业研究实习", profile: "211 经济学硕士", result: "获得实习录用", group: "business", industry: "金融" },
  { company: "华泰证券", role: "财富管理校招", profile: "双非金融硕士", result: "获得校招 offer", group: "business", industry: "金融" },
  { company: "招商银行", role: "总行管培生", profile: "985 本科", result: "获得管培生 offer", group: "business", industry: "银行" },
  { company: "宁波银行", role: "分行营销校招", profile: "普通本科", result: "获得校招 offer", group: "business", industry: "银行" },
  { company: "普华永道", role: "审计实习", profile: "会计学本科", result: "获得实习录用", group: "business", industry: "财会" },
  { company: "德勤", role: "管理咨询实习", profile: "海外商科硕士", result: "获得暑期实习", group: "business", industry: "咨询" },
  { company: "安永", role: "税务校招", profile: "双非会计硕士", result: "获得校招 offer", group: "business", industry: "财会" },
  { company: "毕马威", role: "风险咨询实习", profile: "211 金融工程", result: "获得实习录用", group: "business", industry: "咨询" },
  { company: "麦肯锡", role: "商业分析实习", profile: "985 本科", result: "进入暑期项目", group: "business", industry: "咨询" },
  { company: "波士顿咨询", role: "咨询助理校招", profile: "海外硕士", result: "获得校招 offer", group: "business", industry: "咨询" },
  { company: "埃森哲", role: "管理咨询校招", profile: "211 硕士", result: "获得咨询岗位录用", group: "business", industry: "咨询" },
  { company: "仲量联行", role: "商业地产咨询实习", profile: "城市规划硕士", result: "获得实习录用", group: "business", industry: "咨询" },

  { company: "西门子", role: "数字化项目实习", profile: "自动化硕士", result: "获得暑期实习", group: "other", industry: "工业制造" },
  { company: "宁德时代", role: "供应链校招", profile: "211 工业工程", result: "获得校招 offer", group: "other", industry: "新能源" },
  { company: "强生医疗", role: "市场准入实习", profile: "公共卫生硕士", result: "获得实习录用", group: "other", industry: "医疗健康" },
  { company: "蔚来", role: "用户运营校招", profile: "双非硕士", result: "获得校招 offer", group: "other", industry: "汽车" },
  { company: "万科", role: "商业策划校招", profile: "985 建筑硕士", result: "获得校招 offer", group: "other", industry: "建筑地产" },
  { company: "华住集团", role: "收益管理实习", profile: "旅游管理本科", result: "获得实习录用", group: "other", industry: "文旅酒店" },
]);

const displayPattern = Object.freeze([
  ...Array.from({ length: 6 }, () => ["internet", "consumer", "internet", "business", "internet", "consumer", "internet", "business", "internet", "other"]).flat(),
  "internet", "consumer", "internet", "business",
]);

const casesByGroup = caseLibrary.reduce((groups, item) => {
  groups[item.group] ??= [];
  groups[item.group].push(item);
  return groups;
}, {});

export const cases = Object.freeze(displayPattern.map((group) => casesByGroup[group].shift()));
