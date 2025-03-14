const conditions = [
    { id: "blinded", name: "目盲", desc: "无法视物，视觉相关检定失败。受攻击时对方有优势，自身攻击有劣势。" },
    { id: "charmed", name: "魅惑", desc: "无法攻击魅惑者，魅惑者的社交检定有优势。" },
    { id: "deafened", name: "耳聋", desc: "无法听音，听觉相关检定失败。" },
    { id: "frightened", name: "恐慌", desc: "在恐慌源头视线内时检定有劣势，且无法主动靠近源头。" },
    { id: "grappled", name: "擒抱", desc: "速度归零，被移动或擒抱者失能时状态解除。" },
    { id: "incapacitated", name: "失能", desc: "无法执行任何动作或反应。" },
    { id: "invisible", name: "隐形", desc: "只能被特殊方式察觉，攻击他人有优势，被攻击有劣势。" },
    { id: "paralyzed", name: "麻痹", desc: "无法行动说话，豁免失败，被近战攻击必暴击。" },
    { id: "petrified", name: "石化", desc: "变为雕像，免疫伤害和毒素，攻击检定有优势。" },
    { id: "exhaustion", name: "力竭", desc: "分6级，逐级叠加负面效果（属性劣势、速度减半、濒死等）。" },
    { id: "poisoned", name: "中毒", desc: "攻击检定和属性检定均有劣势。" },
    { id: "prone", name: "倒地", desc: "需爬行移动，近战攻击对其有优势，远程攻击有劣势。" },
    { id: "restrained", name: "束缚", desc: "速度归零，攻击与被攻击均有劣势，敏捷豁免劣势。" },
    { id: "stunned", name: "震慑", desc: "无法行动说话，豁免失败，被攻击有优势。" },
    { id: "unconscious", name: "昏迷", desc: "完全失去意识，近战攻击必暴击，豁免失败。" }
];