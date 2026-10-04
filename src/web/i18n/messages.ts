// Stable English keys; each value is [Simplified Chinese, English, Japanese].
// UI text only. Shared card data and external content are never translation keys.
export const messages = {
  "draft.all": ["本机草稿", "Local drafts", "ローカル下書き"],
  "draft.copyHint": ["打开对应的编辑窗口可恢复草稿。若原任务已归档或删除，可在此选择并复制输入；删除不会改变共享内容。", "Restore drafts in their editors. If the original task was archived or deleted, select and copy its input here. Deleting a draft does not change shared content.", "対応する編集画面で復元できます。元のタスクが削除・アーカイブされた場合はここで入力をコピーできます。下書きの削除は共有内容に影響しません。"],
  "draft.empty": ["没有可用的本机草稿。", "No saved local drafts.", "保存された下書きはありません。"],
  "draft.localOptIn": ["在此浏览器保留输入草稿（7天，不含个人预览）", "Keep input drafts in this browser for 7 days (no personal previews)", "このブラウザーに入力の下書きを7日間保存（個人プレビューは除外）"],
  "draft.failed": ["本地草稿无法保存或恢复，请复制重要输入。", "Could not save or restore the local draft. Copy important input.", "下書きを保存または復元できません。重要な入力をコピーしてください。"],
  "draft.available": ["发现本机草稿。恢复将替换当前输入，请先保留需要的内容。", "Saved drafts found. Restoring replaces current input; keep any text you need first.", "保存された下書きがあります。復元すると現在の入力を置き換えます。必要な内容を先に保存してください。"],
  "draft.restore": ["恢复草稿：{date}", "Restore draft: {date}", "下書きを復元：{date}"],
  "draft.discardSaved": ["删除这些本机草稿", "Delete these saved drafts", "保存された下書きを削除"],
  "extension.saveTimeout": ["保存结果尚未确认，输入已保留。请重新打开设置核对实际地址。", "Saving timed out; your input is preserved. Reopen settings to check the saved addresses.", "保存結果を確認できません。入力は保持されています。設定を開き直して保存されたアドレスを確認してください。"],
  "columns.conflict": ["列名已被修改。原名称：{original}；远端名称：{remote}；本地名称：{local}。", "The column was renamed. Original: {original}; remote: {remote}; your draft: {local}.", "列名が変更されました。元の名前：{original}、現在：{remote}、下書き：{local}。"],
  "columns.saveCompared": ["核对后保存本地列名", "Save compared name", "確認した名前を保存"],
  "columns.uncertain": ["列可能已创建。请重试确认同一次操作，避免重复创建。", "The column may already exist. Retry to confirm the same operation without duplicates.", "列が作成済みの可能性があります。同じ操作を再試行して結果を確認してください。"],
  "columns.retryCreate": ["重试并确认创建列", "Retry and confirm column", "列の作成結果を再確認"],
  "columns.deletedDraft": ["列“{column}”已删除，未保存的列名仍保留。可复制后丢弃此草稿。", "Column “{column}” was deleted. Your unsaved name is preserved below; copy it before discarding the draft.", "列「{column}」は削除されました。未保存の列名は保持されています。必要に応じてコピーしてから破棄してください。"],
  "columns.deletedDraftLabel": ["已删除列的名称草稿：{column}", "Name draft for deleted column: {column}", "削除された列の名前の下書き：{column}"],
  "columns.discardDraft": ["丢弃此草稿", "Discard this draft", "この下書きを破棄"],
  "preview.commentsUnavailable": ["评论未完整读取，请打开原站查看最新评论。", "Comments could not be fully loaded. Open the source site for the latest comment.", "コメントをすべて取得できませんでした。最新のコメントは元のサイトで確認してください。"],
  "extension.retryLoad": ["重试加载", "Retry loading", "読み込みを再試行"],
  "extension.readFailed": ["无法读取扩展设置。请重试加载。", "Could not read extension settings. Retry loading.", "拡張機能の設定を読み込めませんでした。読み込みを再試行してください。"],
  "error.requestTimedOut": ["请求超时，结果尚未确认。请重新同步或重试同一次操作。", "The request timed out and its result is unconfirmed. Sync again or retry the same operation.", "リクエストがタイムアウトし、結果を確認できません。再同期するか、同じ操作を再試行してください。"],
  "card.createUncertain": ["卡片可能已创建。请重试确认结果，不会重复创建；确认前保留原输入。", "The card may already exist. Retry to confirm without creating a duplicate; your original input is preserved.", "カードが作成済みの可能性があります。再試行しても重複は作成されません。確認まで入力内容を保持します。"],
  "card.retryCreate": ["重试并确认创建结果", "Retry and confirm creation", "再試行して作成結果を確認"],
  "common.close": ["关闭", "Close", "閉じる"],
  "common.cancel": ["取消", "Cancel", "キャンセル"],
  "archive.current": ["Current", "Current", "Current"],
  "archive.nav": ["Archives", "Archives", "Archives"],
  "archive.create": ["归档已完成任务", "Archive completed tasks", "完了したタスクをアーカイブ"],
  "archive.name": ["归档名称", "Archive name", "アーカイブ名"],
  "archive.description": ["归档说明（选填）", "Description (optional)", "説明（任意）"],
  "archive.defaultName": ["{date} · 已完成任务", "{date} · Completed tasks", "{date} · 完了したタスク"],
  "archive.onlyCompleted": ["未完成任务继续留在 Current。取消勾选可保留部分已完成任务。", "Unfinished tasks stay in Current. Uncheck completed tasks you want to keep.", "未完了のタスクは Current に残ります。残したい完了タスクの選択を解除してください。"],
  "archive.selectTask": ["选择任务：{title}", "Select task: {title}", "タスクを選択：{title}"],
  "archive.summary": ["将归档 {count} 项，Current 保留 {remaining} 项。", "Archive {count} tasks; keep {remaining} in Current.", "{count} 件をアーカイブし、Current に {remaining} 件を残します。"],
  "archive.confirm": ["归档 {count} 项", "Archive {count} tasks", "{count} 件をアーカイブ"],
  "archive.created": ["已归档 {count} 项，未完成任务已保留。", "Archived {count} tasks. Unfinished work remains in Current.", "{count} 件をアーカイブしました。未完了のタスクは Current に残っています。"],
  "archive.view": ["查看归档", "View archive", "アーカイブを見る"],
  "archive.list": ["归档列表", "Archive list", "アーカイブ一覧"],
  "archive.search": ["搜索归档", "Search archives", "アーカイブを検索"],
  "archive.searchHint": ["名称或说明", "Name or description", "名前または説明"],
  "archive.listSummary": ["{count} 份归档 · 最新在前", "{count} archives · newest first", "{count} 件のアーカイブ · 新しい順"],
  "archive.counts": ["{cards} 个任务 · {jiras} 个 Jira 关联", "{cards} tasks · {jiras} Jira links", "タスク {cards} 件 · Jira 関連 {jiras} 件"],
  "archive.empty": ["还没有归档。可以从 Current 归档已完成任务。", "No archives yet. Archive completed tasks from Current.", "アーカイブはまだありません。Current から完了したタスクをアーカイブできます。"],
  "archive.noResults": ["没有匹配的归档", "No matching archives", "一致するアーカイブはありません"],
  "archive.more": ["加载更多", "Load more", "さらに読み込む"],
  "archive.rename": ["重命名", "Rename", "名前を変更"],
  "archive.renameTitle": ["重命名归档", "Rename archive", "アーカイブ名を変更"],
  "archive.saveName": ["保存归档名称", "Save archive name", "アーカイブ名を保存"],
  "archive.readonly": ["只读归档", "Read-only archive", "読み取り専用アーカイブ"],
  "archive.live": ["Jira / Mattermost 为源站实时内容，非归档时的历史快照。", "Jira / Mattermost previews show live source content, not content captured at archival time.", "Jira / Mattermost のプレビューは現在の内容です。アーカイブ時点の内容ではありません。"],
  "archive.closeDetail": ["关闭归档详情", "Close archive details", "アーカイブの詳細を閉じる"],
  "archive.restore": ["恢复任务", "Restore tasks", "タスクを復元"],
  "archive.restoreTitle": ["恢复到 Current", "Restore to Current", "Current に復元"],
  "archive.restoreHint": ["创建新卡片，归档记录保留。", "Create new cards and keep the archive unchanged.", "新しいカードを作成します。アーカイブはそのまま残ります。"],
  "archive.target": ["恢复到列", "Restore to column", "復元先の列"],
  "archive.restoreSummary": ["将创建 {count} 张新卡片，追加到目标列末尾。", "Create {count} new cards at the end of the target column.", "復元先の列の末尾に {count} 枚の新しいカードを作成します。"],
  "archive.restoreConfirm": ["恢复 {count} 项到 Current", "Restore {count} tasks to Current", "{count} 件を Current に復元"],
  "archive.restored": ["已恢复 {count} 项，归档记录保留。", "Restored {count} tasks. The archive is unchanged.", "{count} 件を復元しました。アーカイブはそのまま残っています。"],
  "archive.alreadyCurrent": ["已在 Current", "Already in Current", "Current に存在します"],
  "archive.openCurrent": ["查看 Current", "View Current", "Current を見る"],
  "archive.changed": ["看板已更新，请重新核对任务。", "The board changed. Review the tasks again.", "ボードが更新されました。タスクを再確認してください。"],
  "archive.review": ["重新核对任务", "Review tasks again", "タスクを再確認"],
  "archive.uncertain": ["保存结果尚未确认。请重试同一次操作，避免重复提交。", "The save result is not confirmed. Retry this operation to avoid duplicates.", "保存結果を確認できません。同じ操作を再試行して重複を防いでください。"],
  "archive.noDoneColumn": ["请先在列管理中设置完成列。", "Set a completed column in column settings first.", "列の設定で完了列を指定してください。"],
  "archive.noCompleted": ["目前没有可归档的已完成任务。", "There are no completed tasks to archive.", "アーカイブできる完了タスクはありません。"],
  "archive.doneColumn": ["完成列", "Completed column", "完了列"],
  "archive.setDone": ["将{column}设为完成列", "Mark {column} as completed column", "{column} を完了列に設定"],
  "archive.archivedDraft": ["此任务已归档，本地草稿已保留。", "This task was archived. Your local draft is preserved.", "このタスクはアーカイブされました。編集中の内容は保持されています。"],
  "archive.copyDraft": ["复制草稿", "Copy draft", "編集中の内容をコピー"],
  "archive.draftCopy": ["草稿副本", "Draft copy", "編集中の内容のコピー"],
  "archive.linksChanged": ["归档链接与当前站点配置不匹配，请检查配置后重试。", "Archived links do not match the current site settings. Check settings and retry.", "アーカイブ内のリンクが現在のサイト設定と一致しません。設定を確認して再試行してください。"],
  "archive.alreadyRestored": ["选中的任务已有 Current 副本，请重新核对。", "Selected tasks already have copies in Current. Review your selection.", "選択したタスクは Current に存在します。選択を再確認してください。"],
  "preview.cardToggle": ["卡片预览", "Card previews", "カードのプレビュー"],
  "preview.on": ["开", "On", "オン"],
  "preview.off": ["关", "Off", "オフ"],
  "card.jiraTickets": ["Jira 票据", "Jira tickets", "Jira 課題"],
  "card.hierarchyHint": ["每张 Jira 票据下可添加多条 Mattermost 消息。移除票据会一起移除它的消息关联。", "Add Mattermost messages under each Jira ticket. Removing a ticket also removes its message links.", "Jira 課題ごとに Mattermost メッセージを追加できます。課題を削除すると、そのメッセージの関連付けも削除されます。"],
  "card.addJira": ["添加 Jira 票据", "Add Jira ticket", "Jira 課題を追加"],
  "card.jiraNumber": ["Jira 票据 {index}", "Jira ticket {index}", "Jira 課題 {index}"],
  "card.moveJiraUp": ["上移 Jira 票据 {index}", "Move Jira ticket {index} up", "Jira 課題 {index} を上へ"],
  "card.moveJiraDown": ["下移 Jira 票据 {index}", "Move Jira ticket {index} down", "Jira 課題 {index} を下へ"],
  "card.removeJira": ["移除 Jira 票据 {index} 及其消息关联", "Remove Jira ticket {index} and its message links", "Jira 課題 {index} とメッセージの関連付けを削除"],
  "card.moveMessageTo": ["移动到其他 Jira 票据", "Move to another Jira ticket", "別の Jira 課題へ移動"],
  "card.chooseJira": ["选择 Jira 票据…", "Choose a Jira ticket…", "Jira 課題を選択…"],
  "card.assignMessage": ["归属到 Jira 票据", "Assign to a Jira ticket", "Jira 課題に割り当て"],
  "card.unassignedMessages": ["待归属消息", "Unassigned messages", "未割り当てのメッセージ"],
  "card.unassignedHint": ["这些历史消息尚未关联 Jira。请添加或选择上方的票据，再将消息归入其中。", "These existing messages have no Jira ticket. Add or choose a ticket above, then assign each message to it.", "これらの既存メッセージには Jira 課題がありません。上で課題を追加または選択し、各メッセージを割り当ててください。"],
  "preview.reconnecting": ["正在恢复个人预览连接…", "Reconnecting personal previews…", "個人プレビューに再接続しています…"],
  "extension.title": ["扩展连接设置", "Extension connection settings", "拡張機能の接続設定"],
  "extension.eyebrow": ["你的工作空间", "YOUR WORKSPACE", "あなたのワークスペース"],
  "extension.description": ["连接你的看板、Jira 和 Mattermost。设置仅用于当前浏览器。", "Connect your board, Jira and Mattermost. These settings apply only to this browser.", "ボード、Jira、Mattermost に接続します。この設定は現在のブラウザーにのみ適用されます。"],
  "extension.board": ["看板地址", "Board address", "ボードのアドレス"],
  "extension.boardHint": ["填写完整站点地址，可包含端口。", "Enter the full site address, including the port if needed.", "必要に応じてポート番号を含む、サイトの完全なアドレスを入力してください。"],
  "extension.jira": ["Jira 地址", "Jira address", "Jira のアドレス"],
  "extension.jiraHint": ["保留站点使用的路径，例如 /jira。", "Include the site's path, such as /jira.", "/jira など、サイトで使用するパスも含めてください。"],
  "extension.mattermost": ["Mattermost 地址", "Mattermost address", "Mattermost のアドレス"],
  "extension.mattermostHint": ["填写站点地址，不需要消息或频道链接。", "Enter the site address, rather than a message or channel link.", "メッセージやチャンネルのリンクではなく、サイトのアドレスを入力してください。"],
  "extension.save": ["保存设置", "Save settings", "設定を保存"],
  "extension.reset": ["恢复部署默认", "Restore deployment defaults", "配布時の設定に戻す"],
  "extension.defaults": ["使用部署默认", "Using deployment defaults", "配布時の設定を使用中"],
  "extension.custom": ["使用个人设置", "Using your settings", "個人設定を使用中"],
  "extension.ready": ["已保存地址的站点权限已具备", "Access is granted for the saved sites", "保存済みサイトへのアクセスが許可されています"],
  "extension.permissionNeeded": ["需要站点权限。点击保存后，按浏览器提示授权。", "Site access is needed. Save and allow access when your browser asks.", "サイトへのアクセス許可が必要です。保存後、ブラウザーの案内に従って許可してください。"],
  "extension.saved": ["已保存。请刷新看板以应用新地址。", "Saved. Refresh the board to apply the new addresses.", "保存しました。新しいアドレスを適用するため、ボードを更新してください。"],
  "extension.restored": ["已恢复部署默认。请刷新看板。", "Deployment defaults restored. Refresh the board.", "配布時の設定に戻しました。ボードを更新してください。"],
  "extension.invalid": ["请检查地址：以 http:// 或 https:// 开头，看板地址不能带子路径，也不能包含账号、查询参数或片段。", "Check the addresses: use http:// or https://, keep the board at the site root, and omit credentials, query parameters and fragments.", "アドレスを確認してください。http:// または https:// で始め、ボードはサイトのルートを指定します。認証情報、クエリ、フラグメントは含めないでください。"],
  "extension.denied": ["未获得站点权限，原设置保持不变。", "Site access was not granted. Your previous settings are unchanged.", "サイトへのアクセスが許可されませんでした。以前の設定を保持しています。"],
  "extension.failed": ["无法保存设置。请重试；若仍失败，请重新加载扩展。", "Could not save settings. Try again, or reload the extension if the problem continues.", "設定を保存できませんでした。再試行し、解決しない場合は拡張機能を再読み込みしてください。"],
  "extension.loadFailed": ["无法读取有效设置，预览已暂停。请重新保存地址或恢复部署默认。", "Valid settings could not be loaded, so previews are paused. Save the addresses again or restore deployment defaults.", "有効な設定を読み込めないため、プレビューを停止しています。アドレスを保存し直すか、配布時の設定に戻してください。"],
  "extension.note": ["地址需与看板的部署配置一致。请在 Jira 和 Mattermost 原站点登录，无需在这里填写密码。", "Use the addresses configured for your board. Sign in on the Jira and Mattermost sites; no passwords are needed here.", "ボードの配布設定と一致するアドレスを使用してください。Jira と Mattermost のサイトでログインします。ここでパスワードを入力する必要はありません。"],
  "extension.openBoard": ["打开看板 ↗", "Open board ↗", "ボードを開く ↗"],
  "connection.configurationMismatch": ["扩展地址与看板不一致，请检查扩展设置", "Extension addresses do not match this board. Check extension settings.", "拡張機能とボードのアドレスが一致しません。拡張機能の設定を確認してください。"],
  "language.auto": ["自动", "Auto", "自動"],
  "language.followBrowser": [
    "跟随浏览器",
    "Use browser language",
    "ブラウザーに合わせる"
  ],
  "app.tagline": [
    "让工作进展有迹可循",
    "Keep your work moving forward",
    "仕事の進捗を、ひと目で"
  ],
  "environment.demo": [
    "模拟环境",
    "Demo environment",
    "デモ環境"
  ],
  "sync.connecting": [
    "正在连接",
    "Connecting",
    "接続中"
  ],
  "sync.synced": [
    "已同步",
    "Synced",
    "同期済み"
  ],
  "sync.reconnecting": [
    "连接中断，正在重连",
    "Connection lost. Reconnecting…",
    "接続が切れました。再接続中…"
  ],
  "sync.loadFailed": [
    "读取失败，请重试",
    "Could not load. Please retry.",
    "読み込めませんでした。再試行してください。"
  ],
  "sync.refresh": [
    "重新同步",
    "Sync again",
    "再同期"
  ],
  "board.eyebrow": [
    "团队空间",
    "TEAM WORKSPACE",
    "チームワークスペース"
  ],
  "board.title": [
    "共享工作看板",
    "Shared work board",
    "共有作業ボード"
  ],
  "board.workCount": [
    "{count} 项工作",
    "{count} work items",
    "{count} 件の作業"
  ],
  "board.oneWorkItem": [
    "1 项工作",
    "1 work item",
    "1 件の作業"
  ],
  "columns.manage": [
    "管理列",
    "Manage columns",
    "列を管理"
  ],
  "card.new": [
    "新建卡片",
    "New card",
    "カードを作成"
  ],
  "board.loading": [
    "正在读取共享看板…",
    "Loading the shared board…",
    "共有ボードを読み込み中…"
  ],
  "app.sharedNotesFooter": [
    "共享笔记 · 即时同步",
    "Shared notes · Live updates",
    "共有メモ · リアルタイム同期"
  ],
  "app.sourceContentFooter": [
    "Jira 与消息原文保留在各自系统",
    "Jira and message content stay in their source systems",
    "Jira とメッセージの原文は各システムに保持されます"
  ],
  "board.ariaLabel": [
    "工作看板",
    "Work board",
    "作業ボード"
  ],
  "card.newInColumn": [
    "在{column}新建卡片",
    "New card in {column}",
    "{column}にカードを作成"
  ],
  "card.open": [
    "打开卡片：{title}",
    "Open card: {title}",
    "カードを開く：{title}"
  ],
  "card.messageCount": [
    "{count} 条消息",
    "{count} messages",
    "メッセージ {count} 件"
  ],
  "card.oneMessage": [
    "1 条消息",
    "1 message",
    "メッセージ 1 件"
  ],
  "board.emptyColumn": [
    "从一张工作卡片开始",
    "Start with a work card",
    "最初のカードを追加しましょう"
  ],
  "card.add": [
    "添加卡片",
    "Add card",
    "カードを追加"
  ],
  "columns.todo": [
    "待处理",
    "To do",
    "未着手"
  ],
  "columns.investigating": [
    "调查中",
    "Investigating",
    "調査中"
  ],
  "columns.implementing": [
    "实装中",
    "Implementing",
    "実装中"
  ],
  "columns.unitTesting": [
    "单体测试",
    "Unit testing",
    "単体テスト"
  ],
  "columns.integrationTesting": [
    "结合测试",
    "Integration testing",
    "結合テスト"
  ],
  "columns.done": [
    "完成",
    "Done",
    "完了"
  ],
  "card.details": [
    "卡片详情",
    "Card details",
    "カードの詳細"
  ],
  "card.eyebrow": [
    "共享工作",
    "SHARED WORK",
    "共有作業"
  ],
  "card.close": [
    "关闭详情",
    "Close details",
    "詳細を閉じる"
  ],
  "card.sharedFieldsHint": [
    "标题、笔记和关联说明对所有看板使用者可见。",
    "Titles, notes and link descriptions are visible to everyone using this board.",
    "タイトル、メモ、リンクの説明は、このボードの全利用者に公開されます。"
  ],
  "card.column": [
    "所在列",
    "Column",
    "所属する列"
  ],
  "card.chooseColumn": [
    "选择一列",
    "Choose a column",
    "列を選択"
  ],
  "card.columnDeleted": [
    "原来的列已删除，请选择新的列。",
    "The original column was deleted. Choose another column.",
    "元の列は削除されました。別の列を選択してください。"
  ],
  "card.sharedTitle": [
    "共享标题",
    "Shared title",
    "共有タイトル"
  ],
  "card.titlePlaceholder": [
    "这张卡片要完成什么？",
    "What needs to be done?",
    "このカードで何を達成しますか？"
  ],
  "card.sharedNotes": [
    "共享笔记",
    "Shared notes",
    "共有メモ"
  ],
  "card.notesPlaceholder": [
    "记录进展、结论与下一步，支持纯文本。",
    "Record progress, decisions and next steps in plain text.",
    "進捗、結論、次の作業をプレーンテキストで記録します。"
  ],
  "card.jiraLink": [
    "Jira 关联",
    "Jira link",
    "Jira の関連付け"
  ],
  "card.openJira": [
    "打开 Jira 原文 ↗",
    "Open in Jira ↗",
    "Jira で開く ↗"
  ],
  "card.jiraKeyOrUrl": [
    "Jira 编号或链接",
    "Jira key or URL",
    "Jira のキーまたは URL"
  ],
  "card.jiraPlaceholder": [
    "例如 DEMO-1；留空即可解绑",
    "For example DEMO-1; leave blank to unlink",
    "例：DEMO-1。空欄にすると関連付けを解除"
  ],
  "card.mattermostMessages": [
    "Mattermost 消息",
    "Mattermost messages",
    "Mattermost メッセージ"
  ],
  "card.messageUrl": [
    "消息链接 {index}",
    "Message URL {index}",
    "メッセージ URL {index}"
  ],
  "card.messageUrlPlaceholder": [
    "粘贴单条消息的原始链接",
    "Paste a link to a single message",
    "単一メッセージのリンクを貼り付け"
  ],
  "card.messageDescription": [
    "消息说明 {index}",
    "Message description {index}",
    "メッセージの説明 {index}"
  ],
  "card.messageDescriptionPlaceholder": [
    "这条消息与工作有什么关系？",
    "How does this message relate to the work?",
    "このメッセージは作業にどう関係しますか？"
  ],
  "card.moveMessageUp": [
    "上移消息 {index}",
    "Move message {index} up",
    "メッセージ {index} を上へ"
  ],
  "card.moveMessageDown": [
    "下移消息 {index}",
    "Move message {index} down",
    "メッセージ {index} を下へ"
  ],
  "card.removeMessage": [
    "移除消息 {index}",
    "Remove message {index}",
    "メッセージ {index} を外す"
  ],
  "common.remove": [
    "移除",
    "Remove",
    "外す"
  ],
  "card.addMessageLink": [
    "添加消息关联",
    "Add message link",
    "メッセージを関連付け"
  ],
  "card.openMessage": [
    "打开消息原文 {index} ↗",
    "Open message {index} ↗",
    "メッセージ {index} を開く ↗"
  ],
  "preview.title": [
    "个人预览",
    "Personal preview",
    "個人プレビュー"
  ],
  "preview.sessionHint": [
    "按你的原系统身份读取",
    "Read using your own source-system session",
    "元のシステムでのあなたの権限で読み取ります"
  ],
  "card.draftPreserved": [
    "共享内容已更新，本地草稿已保留。",
    "Shared content changed. Your draft has been kept.",
    "共有内容が更新されました。編集中の内容は保持されています。"
  ],
  "card.compareSharedContent": [
    "比较当前共享内容",
    "Compare with current shared content",
    "現在の共有内容と比較"
  ],
  "card.currentTitle": [
    "标题：{title}",
    "Title: {title}",
    "タイトル：{title}"
  ],
  "card.emptyNotes": [
    "（笔记为空）",
    "(No notes)",
    "（メモなし）"
  ],
  "card.notLinked": [
    "未关联",
    "Not linked",
    "関連付けなし"
  ],
  "card.unsavedChanges": [
    "有未保存的修改。",
    "You have unsaved changes.",
    "未保存の変更があります。"
  ],
  "card.keepEditing": [
    "继续编辑",
    "Keep editing",
    "編集を続ける"
  ],
  "card.discardAndClose": [
    "放弃修改并关闭",
    "Discard changes and close",
    "変更を破棄して閉じる"
  ],
  "card.saveComparedDraft": [
    "比较后用草稿保存",
    "Save draft after comparing",
    "比較したうえで編集中の内容を保存"
  ],
  "common.saving": [
    "正在保存…",
    "Saving…",
    "保存中…"
  ],
  "card.saveChanges": [
    "保存修改",
    "Save changes",
    "変更を保存"
  ],
  "card.create": [
    "创建卡片",
    "Create card",
    "カードを作成する"
  ],
  "columns.name": [
    "列名称 {index}",
    "Column name {index}",
    "列名 {index}"
  ],
  "columns.saveNameLabel": [
    "保存列名 {index}",
    "Save column name {index}",
    "列名 {index} を保存"
  ],
  "columns.saveName": [
    "保存名称",
    "Save name",
    "名前を保存"
  ],
  "columns.moveUp": [
    "上移列 {index}",
    "Move column {index} up",
    "列 {index} を上へ"
  ],
  "columns.moveDown": [
    "下移列 {index}",
    "Move column {index} down",
    "列 {index} を下へ"
  ],
  "columns.moveCardsTo": [
    "删除{column}后移至",
    "Move cards from {column} to",
    "{column}のカードの移動先"
  ],
  "columns.chooseDestination": [
    "选择接收卡片的列",
    "Choose a destination column",
    "移動先の列を選択"
  ],
  "columns.deleteAndMove": [
    "迁移卡片并删除{column}",
    "Move cards and delete {column}",
    "カードを移動して{column}を削除"
  ],
  "columns.eyebrow": [
    "看板设置",
    "BOARD SETTINGS",
    "ボード設定"
  ],
  "columns.close": [
    "关闭列管理",
    "Close column settings",
    "列の設定を閉じる"
  ],
  "columns.description": [
    "调整工作流。删除列时，其卡片会依原顺序移到目标列末尾。",
    "Customize the workflow. Deleting a column moves its cards to the end of the destination column in their current order.",
    "作業の流れを調整します。列を削除すると、そのカードは順序を保って移動先の末尾に追加されます。"
  ],
  "columns.newName": [
    "新列名称",
    "New column name",
    "新しい列の名前"
  ],
  "columns.add": [
    "添加列",
    "Add column",
    "列を追加"
  ],
  "error.sharedConflict": [
    "共享内容已更新，请比较后重试。",
    "Shared content changed. Compare it before retrying.",
    "共有内容が更新されました。比較してから再試行してください。"
  ],
  "error.notFound": [
    "内容已不存在，请刷新看板。",
    "This content no longer exists. Refresh the board.",
    "対象の内容は削除されました。ボードを更新してください。"
  ],
  "error.invalidInput": [
    "请检查标题、链接或目标位置。",
    "Check the title, links or destination.",
    "タイトル、リンク、移動先を確認してください。"
  ],
  "error.sourceNotAllowed": [
    "请求来源不被允许，请从配置的看板地址打开。",
    "This source is not allowed. Open the configured board address.",
    "許可されていないアクセス元です。設定されたボードのアドレスを開いてください。"
  ],
  "error.requestFailed": [
    "暂时无法保存或读取，请稍后重试。",
    "Could not save or load. Please try again later.",
    "保存または読み込みができません。しばらくしてから再試行してください。"
  ],
  "preview.connected": [
    "个人预览已连接",
    "Personal previews connected",
    "個人プレビューに接続済み"
  ],
  "preview.connecting": [
    "正在连接个人预览…",
    "Connecting personal previews…",
    "個人プレビューに接続中…"
  ],
  "preview.disconnectedSharedAvailable": [
    "扩展未连接，仍可编辑共享内容",
    "Extension disconnected. Shared editing is still available.",
    "拡張機能は未接続です。共有内容は引き続き編集できます。"
  ],
  "preview.refreshAll": [
    "刷新全部预览",
    "Refresh all previews",
    "すべてのプレビューを更新"
  ],
  "preview.reconnect": [
    "重新连接扩展",
    "Reconnect extension",
    "拡張機能に再接続"
  ],
  "preview.loginRequired": [
    "需要登录原系统",
    "Sign in to the source system",
    "元のシステムにログインしてください"
  ],
  "preview.unavailable": [
    "无权访问或资源不可用",
    "No access or resource unavailable",
    "アクセス権がないか、利用できないリソースです"
  ],
  "preview.networkFailed": [
    "网络读取失败",
    "Network request failed",
    "ネットワークの読み込みに失敗しました"
  ],
  "preview.rateLimited": [
    "请求受限，请稍后手动刷新",
    "Rate limited. Refresh manually later.",
    "リクエスト制限中です。時間をおいて手動で更新してください。"
  ],
  "preview.unreadableResponse": [
    "响应无法读取",
    "Could not read the response",
    "応答を読み取れません"
  ],
  "preview.disconnected": [
    "扩展未连接",
    "Extension disconnected",
    "拡張機能が未接続です"
  ],
  "preview.unknownUser": [
    "未知用户",
    "Unknown user",
    "不明なユーザー"
  ],
  "preview.channelUnavailable": [
    "频道不可见",
    "Channel unavailable",
    "チャンネルを表示できません"
  ],
  "preview.contentTruncated": [
    "内容已截断，请打开原文查看。",
    "Content shortened. Open the original to read more.",
    "内容を省略しています。続きを見るには原文を開いてください。"
  ],
  "preview.ariaLabel": [
    "个人 {source} 预览 {id}",
    "Personal {source} preview {id}",
    "個人用 {source} プレビュー {id}"
  ],
  "preview.message": [
    "消息预览",
    "Message preview",
    "メッセージのプレビュー"
  ],
  "preview.onlyYou": [
    "仅自己可见",
    "Only visible to you",
    "自分にのみ表示"
  ],
  "preview.refresh": [
    "刷新个人预览",
    "Refresh personal preview",
    "個人プレビューを更新"
  ],
  "preview.loading": [
    "正在读取…",
    "Loading…",
    "読み込み中…"
  ],
  "preview.waiting": [
    "等待读取",
    "Waiting to load",
    "読み込み待ち"
  ],
  "preview.connectPrompt": [
    "连接扩展后可查看个人预览",
    "Connect the extension to see personal previews",
    "拡張機能に接続すると個人プレビューを表示できます"
  ],
  "preview.outdated": [
    "旧内容",
    "Outdated",
    "古い内容"
  ],
  "preview.retryAfter": [
    "{time} 后可重试",
    "Retry after {time}",
    "{time} 以降に再試行できます"
  ],
  "preview.unassigned": [
    "未指定担当者",
    "Unassigned",
    "担当者なし"
  ],
  "preview.noComments": [
    "暂无评论",
    "No comments yet",
    "コメントはまだありません"
  ],
  "preview.lastLoaded": [
    "最后成功 {time}",
    "Last loaded {time}",
    "最終取得 {time}"
  ],
  "preview.openOriginal": [
    "查看原文 ↗",
    "Open original ↗",
    "原文を開く ↗"
  ],
  "connection.connecting": [
    "连接中",
    "Connecting",
    "接続中"
  ],
  "connection.disconnected": [
    "已断开",
    "Disconnected",
    "切断済み"
  ],
  "connection.connected": [
    "已连接",
    "Connected",
    "接続済み"
  ],
  "connection.failed": [
    "连接失败",
    "Connection failed",
    "接続に失敗しました"
  ],
  "connection.unavailable": [
    "扩展不可用",
    "Extension unavailable",
    "拡張機能を利用できません"
  ],
  "connection.paused": [
    "已暂停",
    "Paused",
    "一時停止中"
  ],
  "probe.loginRequired": [
    "请到原站点重新登录，然后手动读取。",
    "Sign in again at the source site, then read manually.",
    "元のサイトに再ログインしてから、手動で読み込んでください。"
  ],
  "probe.unavailable": [
    "当前会话无法读取此资源。",
    "Your current session cannot access this resource.",
    "現在のセッションではこのリソースを読み取れません。"
  ],
  "probe.networkFailed": [
    "读取暂时失败，请稍后重试。",
    "Loading failed temporarily. Try again later.",
    "一時的に読み込めません。しばらくしてから再試行してください。"
  ],
  "probe.rateLimited": [
    "原站点限制了读取频率，请等待后重试。",
    "The source site is rate limiting requests. Wait and retry.",
    "元のサイトでリクエストが制限されています。時間をおいて再試行してください。"
  ],
  "probe.unrecognizedResponse": [
    "原站点返回的内容无法识别，未作为预览显示。",
    "The source response was not recognized and is not shown as a preview.",
    "元のサイトの応答を認識できなかったため、プレビューには表示していません。"
  ],
  "probe.disconnected": [
    "扩展连接已断开，请重新连接。",
    "The extension disconnected. Please reconnect.",
    "拡張機能との接続が切れました。再接続してください。"
  ],
  "probe.invalidResource": [
    "请输入有效的模拟票据或消息标识。",
    "Enter a valid demo issue key or message ID.",
    "有効なデモ課題キーまたはメッセージ ID を入力してください。"
  ],
  "probe.eyebrow": [
    "WORKLOG / 接入验证",
    "WORKLOG / CONNECTION CHECK",
    "WORKLOG / 接続確認"
  ],
  "probe.heading": [
    "先确认，个人预览能正常读取。",
    "Check that personal previews work.",
    "個人プレビューの接続を確認しましょう。"
  ],
  "probe.description": [
    "共享工作记录留在看板。外部内容由当前浏览器的登录会话决定。",
    "Shared work stays on the board. External content depends on this browser’s signed-in session.",
    "共有作業はボードに保存されます。外部コンテンツの表示は、このブラウザーのログイン状態に従います。"
  ],
  "probe.signInHint": [
    "每个浏览器 profile 独立登录；这里无需输入密码或 Token。",
    "Sign in separately in each browser profile. No passwords or tokens are entered here.",
    "ブラウザープロファイルごとにログインします。ここでパスワードやトークンを入力する必要はありません。"
  ],
  "probe.reconnect": [
    "重新连接",
    "Reconnect",
    "再接続"
  ],
  "probe.demoLogin": [
    "模拟登录 ↗",
    "Demo sign-in ↗",
    "デモログイン ↗"
  ],
  "probe.jiraIssue": [
    "Jira 票据",
    "Jira issue",
    "Jira 課題"
  ],
  "probe.jiraExamples": [
    "DEMO-1 公开 · DEMO-2 Alice 专属 · DEMO-3 空态",
    "DEMO-1 public · DEMO-2 Alice only · DEMO-3 empty",
    "DEMO-1 公開 · DEMO-2 Alice のみ · DEMO-3 空の状態"
  ],
  "probe.readJira": [
    "读取 Jira",
    "Read Jira",
    "Jira を読み込む"
  ],
  "probe.messageId": [
    "消息标识",
    "Message ID",
    "メッセージ ID"
  ],
  "probe.messageExamples": [
    "26 个 a：公开消息 · 26 个 b：Alice 专属",
    "26 a’s: public message · 26 b’s: Alice only",
    "a を26文字：公開 · b を26文字：Alice のみ"
  ],
  "probe.readMattermost": [
    "读取 Mattermost",
    "Read Mattermost",
    "Mattermost を読み込む"
  ],
  "probe.currentPreview": [
    "当前浏览器的预览",
    "Preview for this browser",
    "このブラウザーのプレビュー"
  ],
  "probe.notLoaded": [
    "尚无成功读取",
    "Not loaded yet",
    "まだ取得していません"
  ],
  "probe.loading": [
    "正在读取可见内容…",
    "Loading visible content…",
    "閲覧可能な内容を読み込み中…"
  ],
  "probe.retryAt": [
    "可再次读取时间：{time}",
    "You can read again at {time}",
    "次に読み込める時刻：{time}"
  ],
  "probe.emptyPreview": [
    "先在原站点选择模拟身份，再读取一条资源。",
    "Choose a demo identity at the source site, then read a resource.",
    "元のサイトでデモ用のユーザーを選んでから、リソースを読み込んでください。"
  ],
  "probe.openIssue": [
    "打开原票据 ↗",
    "Open original issue ↗",
    "元の課題を開く ↗"
  ],
  "probe.channelUnavailable": [
    "频道信息不可用",
    "Channel information unavailable",
    "チャンネル情報を取得できません"
  ],
  "probe.openMessage": [
    "打开原消息 ↗",
    "Open original message ↗",
    "元のメッセージを開く ↗"
  ],
  "probe.syntheticResponse": [
    "查看本次合成响应",
    "View this synthetic response",
    "今回の模擬応答を表示"
  ],
  "probe.notRead": [
    "尚未读取",
    "Not read yet",
    "まだ読み込んでいません"
  ],
  "probe.disclaimer": [
    "这是本地模拟验证，不代表公司 SSO 或真实系统兼容性已验收。预览不写入共享服务。",
    "This is a local demo, not verification of company SSO or real-system compatibility. Previews are not saved to the shared service.",
    "これはローカルの動作確認です。社内 SSO や実システムとの互換性を保証するものではありません。プレビューは共有サービスに保存されません。"
  ],
  "probe.pageTitle": [
    "模拟接入验证",
    "Demo connection check",
    "デモ接続確認"
  ],
  "dummy.title": [
    "外部服务模拟控制台",
    "External service demo console",
    "外部サービスのデモ管理"
  ],
  "dummy.currentIdentity": [
    "当前身份：",
    "Current identity:",
    "現在のユーザー："
  ],
  "dummy.signedOut": [
    "未登录",
    "Signed out",
    "未ログイン"
  ],
  "dummy.description": [
    "仅用于本地测试，不需要公司账号、密码或 Token。",
    "For local testing only. No company account, password or token is needed.",
    "ローカルテスト専用です。会社のアカウント、パスワード、トークンは不要です。"
  ],
  "dummy.signInAlice": [
    "以 Alice 登录",
    "Sign in as Alice",
    "Alice としてログイン"
  ],
  "dummy.signInBob": [
    "以 Bob 登录",
    "Sign in as Bob",
    "Bob としてログイン"
  ],
  "dummy.signOut": [
    "退出",
    "Sign out",
    "ログアウト"
  ],
  "dummy.response": [
    "模拟响应",
    "Simulated response",
    "模擬応答"
  ],
  "dummy.apply": [
    "应用",
    "Apply",
    "適用"
  ],
  "dummy.failed": [
    "模拟控制失败",
    "Demo action failed",
    "デモ操作に失敗しました"
  ],
  "dummy.applied": [
    "已应用模拟响应",
    "Simulated response applied",
    "模擬応答を適用しました"
  ],
  "dummy.environment": [
    "模拟环境 · {kind}",
    "Demo environment · {kind}",
    "デモ環境 · {kind}"
  ],
  "dummy.jiraExamples": [
    "Jira：DEMO-1（公开）、DEMO-2（Alice）、DEMO-3（空态）",
    "Jira: DEMO-1 (public), DEMO-2 (Alice), DEMO-3 (empty)",
    "Jira：DEMO-1（公開）、DEMO-2（Alice）、DEMO-3（空の状態）"
  ],
  "dummy.mattermostExamples": [
    "Mattermost：{public}（公开）、{private}（Alice）",
    "Mattermost: {public} (public), {private} (Alice)",
    "Mattermost：{public}（公開）、{private}（Alice）"
  ],
  "dummy.fault.none": [
    "正常响应",
    "Normal response",
    "正常なレスポンス"
  ],
  "dummy.fault.unauthorized": [
    "登录已过期",
    "Session expired",
    "ログインの有効期限切れ"
  ],
  "dummy.fault.forbidden": [
    "禁止访问",
    "Access denied",
    "アクセス拒否"
  ],
  "dummy.fault.notFound": [
    "资源不存在",
    "Resource not found",
    "リソースが見つかりません"
  ],
  "dummy.fault.rateLimited": [
    "请求限流",
    "Rate limited",
    "リクエスト数の制限"
  ],
  "dummy.fault.loginHtml": [
    "返回登录页面",
    "Return sign-in page",
    "ログインページを返す"
  ],
  "dummy.fault.html": [
    "返回 HTML",
    "Return HTML",
    "HTML を返す"
  ],
  "dummy.fault.malformed": [
    "无效 JSON",
    "Invalid JSON",
    "不正な JSON"
  ],
  "dummy.fault.redirect": [
    "外站重定向",
    "External redirect",
    "外部サイトへリダイレクト"
  ],
  "dummy.fault.delay": [
    "响应延迟",
    "Delayed response",
    "レスポンス遅延"
  ],
  "dummy.fault.connection": [
    "连接中断",
    "Connection interrupted",
    "接続の中断"
  ],
  "dummy.fault.avatarFailure": [
    "头像读取失败",
    "Avatar failure",
    "アバター取得失敗"
  ],
  "dummy.fault.paginationStall": [
    "分页停滞",
    "Pagination stalled",
    "ページ取得の停止"
  ],
  "dummy.fault.missingUser": [
    "缺少用户信息",
    "Missing user information",
    "ユーザー情報の欠落"
  ],
  "dummy.fault.missingChannel": [
    "缺少频道信息",
    "Missing channel information",
    "チャンネル情報の欠落"
  ]
} as const;
