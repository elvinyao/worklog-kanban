import {execFileSync} from 'node:child_process';
import {test,expect,board,jira,mm,login,inspect,chooseLanguage,enablePreviews} from './fixtures';
import {seedCard,sharedRead,sharedWrite} from './shared-helpers';

test('multiple Jira groups retain message ownership, reorder and move messages, and deduplicate previews',async({alice})=>{
 const jiraControl=await login(alice,jira,'alice');const mmControl=await login(alice,mm,'alice');const before=(await inspect(mmControl)).requests.filter(r=>r.path.endsWith('/posts/'+'a'.repeat(26))).length;const page=await alice.newPage();await page.goto(board);await enablePreviews(page);
 await page.getByRole('button',{name:'新建卡片',exact:true}).click();await page.getByLabel('共享标题').fill('多票据验收');await page.getByLabel('共享笔记').fill('Shared hierarchy notes');
 await expect(page.getByRole('button',{name:'添加消息关联'})).toHaveCount(0);
 for(const [index,key] of ['DEMO-1','DEMO-2'].entries()){
  await page.getByRole('button',{name:'添加 Jira 票据'}).click();const group=page.getByRole('group',{name:'Jira 票据 '+(index+1),exact:true});await group.getByLabel('Jira 编号或链接').fill(key);
  for(const [n,letter] of (index===0?['a','b']:['a']).entries()){
   await group.getByRole('button',{name:'添加消息关联'}).click();await group.getByLabel('消息链接 '+(n+1),{exact:true}).fill(mm+'/demo/pl/'+letter.repeat(26));await group.getByLabel('消息说明 '+(n+1),{exact:true}).fill(key+' '+letter);
  }
 }
 await page.getByRole('button',{name:'创建卡片',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 const tile=page.locator('article').filter({has:page.getByRole('button',{name:'打开卡片：多票据验收',exact:true})});
 const groupOne=tile.getByRole('group',{name:'DEMO-1',exact:true}),groupTwo=tile.getByRole('group',{name:'DEMO-2',exact:true});
 await expect(groupOne.locator('.safe-markdown')).toHaveCount(2);await expect(groupTwo.locator('.safe-markdown')).toHaveCount(1);
 await expect(groupOne.getByRole('region',{name:'个人 Mattermost 预览 '+'b'.repeat(26),exact:true})).toContainText('ALICE_ONLY_MARKER');
 await expect(groupTwo.getByRole('region',{name:'个人 Mattermost 预览 '+'b'.repeat(26),exact:true})).toHaveCount(0);
 await tile.screenshot({path:'.tmp/board-grouped-previews.png'});
 await page.setViewportSize({width:390,height:844});expect(await tile.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);await tile.screenshot({path:'.tmp/board-grouped-previews-mobile.png'});await page.setViewportSize({width:1280,height:720});
 await tile.getByRole('button',{name:'打开卡片：多票据验收',exact:true}).click();
 const detail=page.locator('.personal-detail');await expect(detail.getByRole('region',{name:'DEMO-1',exact:true}).locator('.safe-markdown')).toHaveCount(2);await expect(detail.getByRole('region',{name:'DEMO-2',exact:true}).locator('.safe-markdown')).toHaveCount(1);
 expect((await inspect(mmControl)).requests.filter(r=>r.path.endsWith('/posts/'+'a'.repeat(26))).length-before).toBe(1);
 const first=page.getByRole('group',{name:'Jira 票据 1',exact:true});await first.getByRole('button',{name:'上移消息 2'}).click();await first.getByLabel('移动到其他 Jira 票据').first().selectOption({label:jira+'/browse/DEMO-2'});await page.getByRole('button',{name:'上移 Jira 票据 2'}).click();
 await page.getByRole('button',{name:'保存修改',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await page.reload();await page.getByRole('button',{name:'打开卡片：多票据验收',exact:true}).click();
 let card=(await sharedRead(alice)).cards.find(c=>c.title==='多票据验收')!;
 expect(card.jiraLinks.map(j=>[j.key,j.mattermostLinks.map(m=>m.postId)])).toEqual([['DEMO-2',['a'.repeat(26),'b'.repeat(26)]],['DEMO-1',['a'.repeat(26)]]]);expect(card.notes).toBe('Shared hierarchy notes');
 await page.setViewportSize({width:390,height:844});await expect(page.getByRole('group',{name:'Jira 票据 1',exact:true})).toBeVisible();
 expect(await page.getByRole('dialog').evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);await page.screenshot({path:'.tmp/hierarchy-mobile.png'});
 await page.getByRole('button',{name:'关闭详情'}).click();await chooseLanguage(page,'en');await page.getByRole('button',{name:'Open card: 多票据验收',exact:true}).click();await expect(page.getByRole('button',{name:'Add Jira ticket'})).toBeVisible();await page.screenshot({path:'.tmp/hierarchy-en.png'});await page.getByRole('button',{name:'Close details'}).click();await chooseLanguage(page,'ja');
 await page.getByRole('button',{name:'カードを開く：多票据验收',exact:true}).click();await expect(page.getByRole('button',{name:'Jira 課題を追加'})).toBeVisible();await page.getByRole('button',{name:'Jira 課題 1 とメッセージの関連付けを削除'}).click();await page.getByRole('button',{name:'変更を保存',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 card=(await sharedRead(alice)).cards.find(c=>c.title==='多票据验收')!;expect(card.jiraLinks.map(j=>j.key)).toEqual(['DEMO-1']);expect(card.jiraLinks[0]!.mattermostLinks).toHaveLength(1);
 expect((await inspect(jiraControl)).requests.length).toBeGreaterThan(0);
});

test('legacy unassigned messages can be assigned without losing their shared description',async({alice})=>{
 const card=await seedCard(alice,'历史待归属');
 // Synthetic migrated row: the production API deliberately cannot create new unassigned messages.
 execFileSync('python',['-c',"import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute('INSERT INTO mattermost_links VALUES (?,?,?,?,?,?,?,?)', ('orphan_fixture',sys.argv[2],None,'a'*26,'demo',sys.argv[3],'Preserved legacy description',0)); c.commit(); c.close()",process.env.WORKLOG_TEST_DATABASE!,card.id,mm+'/demo/pl/'+'a'.repeat(26)]);
 const page=await alice.newPage();await page.goto(board);await page.getByRole('button',{name:'打开卡片：历史待归属',exact:true}).click();
 const legacy=page.getByRole('region',{name:'待归属消息',exact:true});await expect(legacy.getByLabel('消息说明 1',{exact:true})).toHaveValue('Preserved legacy description');await expect(legacy.getByLabel('消息链接 1',{exact:true})).toHaveAttribute('readonly','');
 await page.getByRole('button',{name:'添加 Jira 票据'}).click();await page.getByLabel('Jira 编号或链接').fill('DEMO-3');await legacy.getByLabel('归属到 Jira 票据').selectOption({label:'DEMO-3'});await expect(legacy).toHaveCount(0);await page.getByRole('button',{name:'保存修改',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 const saved=(await sharedRead(alice)).cards.find(c=>c.id===card.id)!;expect(saved.unassignedMattermostLinks).toEqual([]);expect(saved.jiraLinks[0]!.mattermostLinks[0]!.description).toBe('Preserved legacy description');
});

test('a remote conflict keeps locally moved messages under their chosen Jira ticket',async({alice})=>{
 const card=await seedCard(alice,'层级冲突','DEMO-1',[{url:mm+'/demo/pl/'+'a'.repeat(26),description:'Original'}]);const page=await alice.newPage();await page.goto(board);await page.getByRole('button',{name:'打开卡片：层级冲突',exact:true}).click();
 await page.getByRole('button',{name:'添加 Jira 票据'}).click();await page.getByRole('group',{name:'Jira 票据 2',exact:true}).getByLabel('Jira 编号或链接').fill('DEMO-2');await page.getByLabel('移动到其他 Jira 票据').selectOption({label:'DEMO-2'});await page.getByLabel('消息说明 1',{exact:true}).fill('Locally moved');
 await sharedWrite(alice,'/cards/'+card.id,{expectedVersion:card.version,notes:'Remote update'},'PATCH');await expect(page.getByText('共享内容已更新，本地草稿已保留。')).toBeVisible();await page.getByRole('button',{name:'保存修改',exact:true}).click();await expect(page.getByRole('alert')).toContainText('比较后');
 await expect(page.getByRole('group',{name:'Jira 票据 1',exact:true}).getByLabel('消息链接 1',{exact:true})).toHaveCount(0);await expect(page.getByRole('group',{name:'Jira 票据 2',exact:true}).getByLabel('消息说明 1',{exact:true})).toHaveValue('Locally moved');await expect(page.locator('details')).toContainText('Remote update');
 await page.getByRole('button',{name:'比较后用草稿保存',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);const saved=(await sharedRead(alice)).cards.find(c=>c.id===card.id)!;expect(saved.jiraLinks[0]!.mattermostLinks).toHaveLength(0);expect(saved.jiraLinks[1]!.mattermostLinks[0]!.description).toBe('Locally moved');
});
