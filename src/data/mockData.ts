import { Note, LocalFile } from '../types';

export const INITIAL_NOTES: Note[] = [
  {
    id: 'note-1',
    title: '📊 Project Atlas 项目概述',
    folder: '项目管理',
    content: `# 📊 Project Atlas 项目概述

欢迎来到 **Project Atlas**（阿特拉斯项目）的核心协作空间！本笔记是设计、工程与产品运营的中央调度枢纽。

当前核心目标是在第四季度截止日期前完成所有分布式容器化微服务构件的发布。

## 💾 本地系统资源目录
以下是我们挂载在本地 RAID 磁盘组及外部服务器绝对路径中的重要系统资源。由于在 Git 仓库内直接版本化大容量媒体或设计资产会导致多端同步卡顿甚至崩坏，我们通过自研的 **Obsidian Local Linker (本地目录映射插件)** 直接在本地虚拟磁盘挂载文件，并在笔记内部生成 \`local-file://\` 映射链路。

### 🔗 已关联的本地系统文件：
- [📄 2026年度财务预算与盈余预测.pdf](local-file:///Users/alex/Documents/finance/financial_projection_2026.pdf) — 请在董事会年度审查会议前仔细校对本草案。
- [📄 高可用云架构拓扑图.png](local-file:///Users/alex/Projects/atlas/architecture_diagram.png) — 项目多地域故障转移及负载均衡基础设施蓝图。
- [📄 生产级服务器核心集群配置.json](local-file:///etc/kubernetes/server_config_prod.json) — 直接链接到本地磁盘上配置的 Kubernetes 系统 Schema 参数。

---

## 📅 近期待办清单：
* [x] 与运维保障组确认微服务跨节点网络调优策略。
* [ ] 校验多容器故障自愈机制的实际部署形态。
* [ ] 点击查阅并完成本地供应商电子服务协议的面签：[📄 商务供应商入驻协议草案.pdf](local-file:///Users/alex/Documents/legal/vendor_agreement_draft.pdf)。
`,
    createdAt: '2026-05-20T09:00:00Z',
    updatedAt: '2026-05-22T10:15:00Z'
  },
  {
    id: 'note-2',
    title: '💡 分布式集群架构与技术规约',
    folder: '工程技术',
    content: `# 💡 分布式集群架构与技术规约

记录分布式微服务容器集群的路由策略、代理规则与核心存储方案。

## 🚀 反向代理网关
我们采用定制级 NGINX 边缘网关作为全站反向代理。配置通过本地自动化 CI 模块实时加载。

### 本地直连配置文件
你可以点击直接启动本地默认编辑器，实时编辑与校验外部系统配置文件：
* **生产环境主配置 (K8s JSON):** [📄 生产级服务器核心集群配置.json](local-file:///etc/kubernetes/server_config_prod.json)
* **动态系统架构原型 (PNG):** [📄 高可用云架构拓扑图.png](local-file:///Users/alex/Projects/atlas/architecture_diagram.png)

## 🗄️ 高性能本地磁盘层
为了突破 Electron 沙箱的网络隔离，我们通过此关联协议将高 I/O 吞吐的数据库日志与分析报告直接引入双链框架，规避了高频率的文件传输。
`,
    createdAt: '2026-05-21T14:30:00Z',
    updatedAt: '2026-05-21T18:45:00Z'
  },
  {
    id: 'note-3',
    title: '📋 项目上线前瞻检查清单',
    folder: '产品规划',
    content: `# 📋 项目上线前瞻检查清单

本备忘录实时追踪高负载演练以及合规性发布相关的全部审计任务。

## 🛡️ 强制审计要点
1. 运行持续 48 小时的极限压力健壮性诊断。
2. 校验边缘 CDN 的 SSL 双向受信任证书签发。
3. 精准校核中长期战略产品路线图：
   - 参阅 [📄 前瞻产品长远路线图_v2.md](local-file:///Users/alex/Dropbox/Shared/product_roadmap_v2.md) 已同步最新功能边界与发布排期。
4. 听取最新一期音频调研会议的关键声音：[📄 终端用户体验深访录音.mp3](local-file:///Users/alex/Music/Recordings/user_interview_recording.mp3)。

任何缺陷必须在发布节点前予以闭环，维持灰度版本的平稳运行。
`,
    createdAt: '2026-05-22T08:00:00Z',
    updatedAt: '2026-05-22T16:00:00Z'
  }
];

export const INITIAL_LOCAL_FILES: LocalFile[] = [
  {
    id: 'file-1',
    name: '2026年度财务预算与盈余预测.pdf',
    systemPath: '/Users/alex/Documents/finance/financial_projection_2026.pdf',
    size: '4.2 MB',
    type: 'pdf',
    addedAt: '2026-05-18T11:20:00Z',
    previewContent: 'Adobe PDF 电子文书 v1.7\n作者：财务部副总裁\n页数：14 页\n主要大纲：\n1. 营业收入预测走势 (设定了年度复合成长率 30% 目标)\n2. 集团日常运营开支 (OPEX) 与重点人才引进扩张盘点\n3. 边缘计算基础设施云资源采购利润率调优测算\n4. 地缘政治与供应链波动的多变量防御性敏度测算。'
  },
  {
    id: 'file-2',
    name: '高可用云架构拓扑图.png',
    systemPath: '/Users/alex/Projects/atlas/architecture_diagram.png',
    size: '1.8 MB',
    type: 'image',
    addedAt: '2026-05-19T10:05:00Z',
    previewUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'file-3',
    name: '生产级服务器核心集群配置.json',
    systemPath: '/etc/kubernetes/server_config_prod.json',
    size: '12 KB',
    type: 'code',
    addedAt: '2026-05-20T16:40:00Z',
    previewContent: `{
  "apiVersion": "apps/v1",
  "kind": "Deployment",
  "metadata": {
    "name": "atlas-core-service",
    "namespace": "production",
    "labels": {
      "app": "atlas-core"
    }
  },
  "spec": {
    "replicas": 5,
    "strategy": {
      "type": "RollingUpdate",
      "rollingUpdate": {
        "maxSurge": 2,
        "maxUnavailable": 0
      }
    },
    "template": {
      "spec": {
        "containers": [
          {
            "name": "core-api",
            "image": "gcr.io/project-atlas/core-api:v2.4.1",
            "ports": [
              { "containerPort": 3000 }
            ],
            "resources": {
              "limits": { "cpu": "2000m", "memory": "4Gi" },
              "requests": { "cpu": "500m", "memory": "1Gi" }
            }
          }
        ]
      }
    }
  }
}`
  },
  {
    id: 'file-4',
    name: '终端用户体验深访录音.mp3',
    systemPath: '/Users/alex/Music/Recordings/user_interview_recording.mp3',
    size: '34.5 MB',
    type: 'audio',
    addedAt: '2026-05-21T09:15:00Z',
    previewContent: '音频格式: MP3 Audio 立体声\n播放总长: 18 分 24 秒\n采样参数: 44.1kHz | 256kbps 采样率\n核心节选译文: \n“老实说，这个‘本地协议跳转预览’功能太实用了！以往我用标准版的 Obsidian 进行协作或文档管理时，我都得把动辄几百兆甚至几个G的本地参考 PDF、高清图表、测试录音，物理性复制到我极其有限的 iCloud 跨端同步库中。这样不仅几下就把我 5GB 的云空间塞爆了吐出账单，还在移动端卡死。现在通过这个小插件能直接利用软链接直指非软件沙箱内的磁盘物理位置，既省去了数据冗余过程，双击时又能唤起系统的原生应用直接运行，对重度桌面效率党来说简直是量身定做的神器……”'
  },
  {
    id: 'file-5',
    name: '前瞻产品长远路线图_v2.md',
    systemPath: '/Users/alex/Dropbox/Shared/product_roadmap_v2.md',
    size: '8 KB',
    type: 'markdown',
    addedAt: '2026-05-22T14:30:00Z',
    previewContent: '# 产品研发中长期路线图 v2\n\n## 阶段一：高保真原型管道 (Phase 1)\n- [x] 设计多端聚合仪表盘页面骨架\n- [x] 开发定制化 Obsidian 插件完成外部文件的硬链接\n- [ ] 面向私有化企业用户发布 alpha v1.0.0 正式包\n\n## 阶段二：实时悬浮轻量级视口引擎 (Phase 2)\n- [ ] 部署多线程自适应异步文件扫描解析驱动\n- [ ] 本地主动缓存最近解析过的系统文件悬浮视图，极大加快重载响应速率\n\n## 阶段三：云中转与同步扩展 (Phase 3)\n- [ ] 搭建多端点安全反向通信中转网关\n- [ ] 完美集成 Google Workspace 以完成跨团队实时日程与协同同步。'
  },
  {
    id: 'file-6',
    name: '商务供应商入驻协议草案.pdf',
    systemPath: '/Users/alex/Documents/legal/vendor_agreement_draft.pdf',
    size: '1.2 MB',
    type: 'pdf',
    addedAt: '2026-05-22T15:50:00Z',
    previewContent: 'Adobe PDF 电子文书 v1.4\n文件名称：商务合作综合管理服务及授权特许框架协议\n签署状态：未签署 草签待批\n合作双方：Atlas 科技有限公司（甲方） vs 天顶工程技术股份集团（乙方）\n核心合规条目：\n- 第三款第 1.1 条: 服务费用开具采用30天合并账期顺延模式划拨...\n- 第九款第 2.2 条: 双方在合作期内开发研制的全部私有化源代码仓库、库资产及数据库 Schema 规约，均受 Apache-2.0 软件公共协议条款或甲方独占著作权条款的约束保护。'
  }
];
