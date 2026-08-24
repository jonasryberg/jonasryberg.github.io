const treeView = document.getElementById('treeView');
const agendaView = document.getElementById('agendaView');
const welcome = document.getElementById('welcome');
const banner = document.getElementById('banner');
const filenameEl = document.getElementById('filename');
const searchInput = document.getElementById('search');
const toggleAllButton = document.getElementById('toggleAll');
const treeTab = document.getElementById('treeTab');
const agendaTab = document.getElementById('agendaTab');
const dirtyState = document.getElementById('dirtyState');
const undoButton = document.getElementById('undo');
const showSourceButton = document.getElementById('showSource');
const newTaskButton = document.getElementById('newTask');
const newFileButton = document.getElementById('newFile');
const openFileButton = document.getElementById('openFile');
const welcomeOpenButton = document.getElementById('welcomeOpen');
const saveFileButton = document.getElementById('saveFile');
const saveAsFileButton = document.getElementById('saveAsFile');
const reloadButton = document.getElementById('reload');
const fileState = document.getElementById('fileState');
const chooseBackupFolderButton = document.getElementById('chooseBackupFolder');
const backupState = document.getElementById('backupState');
const recentFiles = document.getElementById('recentFiles');
const recentFilesList = document.getElementById('recentFilesList');
const autosaveToggle = document.getElementById('autosaveToggle');
const autosaveState = document.getElementById('autosaveState');
const fallbackFileInput = document.getElementById('fallbackFileInput');
const browserNote = document.getElementById('browserNote');
const editDialog = document.getElementById('editDialog');
const editForm = document.getElementById('editForm');
const editTitle = document.getElementById('editTitle');
const editTodo = document.getElementById('editTodo');
const editTags = document.getElementById('editTags');
const editScheduled = document.getElementById('editScheduled');
const editDeadline = document.getElementById('editDeadline');
const editBody = document.getElementById('editBody');
const createDialog = document.getElementById('createDialog');
const createForm = document.getElementById('createForm');
const createTarget = document.getElementById('createTarget');
const createTitle = document.getElementById('createTitle');
const createTodo = document.getElementById('createTodo');
const createTags = document.getElementById('createTags');
const createScheduled = document.getElementById('createScheduled');
const createDeadline = document.getElementById('createDeadline');
const createBody = document.getElementById('createBody');
const moveDialog = document.getElementById('moveDialog');
const moveForm = document.getElementById('moveForm');
const moveTaskLabel = document.getElementById('moveTaskLabel');
const moveParent = document.getElementById('moveParent');
const movePosition = document.getElementById('movePosition');
const sourceDialog = document.getElementById('sourceDialog');
const sourceText = document.getElementById('sourceText');

let rawText = '';
let currentModel = null;
let activeView = 'tree';
let originalText = '';
let undoStack = [];
let editingNodeId = null;
let createParentNodeId = null;
let movingNodeId = null;
let fileHandle = null;
let currentFileName = '';
let saving = false;

const hasNativeFileAccess = typeof window.showOpenFilePicker === 'function' && typeof window.showSaveFilePicker === 'function';
const recentFileDatabase = 'org-mode-local';
const recentFileStore = 'settings';
const recentFileKey = 'last-file-handle';
const recentFilesKey = 'recent-file-handles';
const recentFilesLimit = 5;
const backupDirectoryKey = 'backup-directory-handle';
let backupDirectoryHandle = null;
const autosaveSettingKey = 'org-mode-local-autosave';
let autoSaveTimer = null;

init();

async function init() {
  browserNote.textContent = hasNativeFileAccess
    ? 'Direkt öppning och sparning till samma fil stöds i den här webbläsaren.'
    : 'Den här webbläsaren använder kompatibilitetsläge: öppna via filväljare och spara genom en nedladdad fil.';
  updateFileUi();
  autosaveToggle.checked = localStorage.getItem(autosaveSettingKey) === 'true';
  updateAutosaveUi();
  backupDirectoryHandle = await getStoredHandle(backupDirectoryKey);
  updateBackupUi();
  await updateRecentFilesUi();
  await restoreLastFile();
}

openFileButton.addEventListener('click', openLocalFile);
welcomeOpenButton.addEventListener('click', openLocalFile);
newFileButton.addEventListener('click', createNewFile);
saveFileButton.addEventListener('click', saveLocalFile);
saveAsFileButton.addEventListener('click', saveAsLocalFile);
reloadButton.addEventListener('click', reloadLocalFile);
chooseBackupFolderButton.addEventListener('click', chooseBackupFolder);
fallbackFileInput.addEventListener('change', handleFallbackFile);
toggleAllButton.addEventListener('click', toggleAll);
treeTab.addEventListener('click', () => setActiveView('tree'));
agendaTab.addEventListener('click', () => setActiveView('agenda'));
searchInput.addEventListener('input', () => {
  applySearch();
  persistWorkspaceState();
});
autosaveToggle.addEventListener('change', () => {
  localStorage.setItem(autosaveSettingKey, String(autosaveToggle.checked));
  updateAutosaveUi();
  if (autosaveToggle.checked) {
    saveLocalDraft();
    scheduleAutoSave();
  } else {
    clearTimeout(autoSaveTimer);
    removeLocalDraft();
  }
});
undoButton.addEventListener('click', undoLastChange);
showSourceButton.addEventListener('click', showCurrentSource);
newTaskButton.addEventListener('click', () => openCreateTaskDialog(null));
document.getElementById('editClose').addEventListener('click', () => editDialog.close());
document.getElementById('editCancel').addEventListener('click', () => editDialog.close());
document.getElementById('createClose').addEventListener('click', () => createDialog.close());
document.getElementById('createCancel').addEventListener('click', () => createDialog.close());
document.getElementById('moveClose').addEventListener('click', () => moveDialog.close());
document.getElementById('moveCancel').addEventListener('click', () => moveDialog.close());
document.getElementById('sourceClose').addEventListener('click', () => sourceDialog.close());
document.getElementById('sourceCloseBottom').addEventListener('click', () => sourceDialog.close());
editForm.addEventListener('submit', saveNodeEdit);
createForm.addEventListener('submit', saveNewTask);
moveForm.addEventListener('submit', saveTaskMove);

window.addEventListener('beforeunload', (event) => {
  if (rawText && rawText !== originalText) {
    event.preventDefault();
    event.returnValue = '';
  }
});

window.addEventListener('dragover', (event) => {
  if ([...event.dataTransfer.types].includes('Files')) {
    event.preventDefault();
    document.body.classList.add('dragging');
  }
});
window.addEventListener('dragleave', (event) => {
  if (!event.relatedTarget) document.body.classList.remove('dragging');
});
window.addEventListener('drop', async (event) => {
  event.preventDefault();
  document.body.classList.remove('dragging');
  const file = event.dataTransfer.files?.[0];
  if (!file) return;
  if (rawText !== originalText) {
    const discard = confirm('Du har osparade ändringar. Öppna den släppta filen och kasta dem?');
    if (!discard) return;
  }
  await loadFromFileObject(file, null);
});

async function openLocalFile() {
  if (rawText && rawText !== originalText) {
    const discard = confirm('Du har osparade ändringar. Öppna en annan fil och kasta dem?');
    if (!discard) return;
  }

  banner.hidden = true;
  try {
    if (hasNativeFileAccess) {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{
          description: 'Org-mode-filer',
          accept: { 'text/plain': ['.org', '.txt'] }
        }]
      });
      const file = await handle.getFile();
      await loadFromFileObject(file, handle);
    } else {
      fallbackFileInput.value = '';
      fallbackFileInput.click();
    }
  } catch (error) {
    if (error?.name !== 'AbortError') showLocalError(error.message || String(error));
  }
}

async function openRecentFile(handle) {
  if (!handle) return;
  if (rawText && rawText !== originalText) {
    const discard = confirm('Du har osparade ändringar. Öppna den valda filen och kasta dem?');
    if (!discard) return;
  }

  try {
    if (await handle.queryPermission({ mode: 'read' }) !== 'granted') {
      if (await handle.requestPermission({ mode: 'read' }) !== 'granted') return;
    }
    await loadFromFileObject(await handle.getFile(), handle);
  } catch (error) {
    showLocalError(`Kunde inte öppna ${handle.name || 'filen'}: ${error.message || error}`);
  }
}

async function createNewFile() {
  if (rawText && rawText !== originalText) {
    const discard = confirm('Du har osparade ändringar. Skapa en ny fil och kasta dem?');
    if (!discard) return;
  }

  rawText = '#+TITLE: Ny Org-fil\n\n';
  originalText = '';
  undoStack = [];
  fileHandle = null;
  currentFileName = 'Ny Org-fil.org';
  filenameEl.textContent = currentFileName;
  banner.hidden = true;
  welcome.hidden = true;
  treeView.hidden = false;
  renderOrg(rawText);
  setActiveView('tree');
  updateAutosaveUi();
  updateEditState();
  await saveAsLocalFile();
}

async function restoreLastFile() {
  if (!hasNativeFileAccess) return;

  try {
    const handle = await getRememberedFileHandle();
    if (!handle || await handle.queryPermission({ mode: 'readwrite' }) !== 'granted') return;
    const file = await handle.getFile();
    await loadFromFileObject(file, handle);
  } catch (error) {
    await forgetLastFileHandle();
  }
}

async function chooseBackupFolder() {
  if (!hasNativeFileAccess) return;
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    backupDirectoryHandle = handle;
    await storeHandle(backupDirectoryKey, handle);
    updateBackupUi();
    if (fileHandle) await createOpeningBackup(await fileHandle.getFile());
  } catch (error) {
    if (error?.name !== 'AbortError') showLocalError(error.message || String(error));
  }
}

async function createOpeningBackup(file) {
  if (!backupDirectoryHandle || !file) return;
  const now = new Date();
  const dateFolderName = formatLocalDate(now);
  const backupFolder = await backupDirectoryHandle.getDirectoryHandle(dateFolderName, { create: true });
  const timestamp = formatLocalTimestamp(now);
  const backupName = `${timestamp}_${file.name || 'tasks.org'}`;
  const backupFile = await backupFolder.getFileHandle(backupName, { create: true });
  const writable = await backupFile.createWritable();
  await writable.write(await file.text());
  await writable.close();
  showLocalBanner(`Backup skapad i bak: ${backupName}`, 'success');
}

function updateBackupUi() {
  const supported = hasNativeFileAccess;
  chooseBackupFolderButton.disabled = !supported;
  backupState.textContent = !supported
    ? 'Backup kräver Chrome eller Edge'
    : backupDirectoryHandle
      ? `Backup: ${backupDirectoryHandle.name}/${formatLocalDate(new Date())}`
      : 'Ingen backupmapp vald';
}

function updateAutosaveUi() {
  autosaveState.textContent = !autosaveToggle.checked
    ? 'Av'
    : fileHandle
      ? 'På till fil'
      : 'På lokalt';
  autosaveState.classList.toggle('autosave-on', autosaveToggle.checked);
}

function scheduleAutoSave() {
  clearTimeout(autoSaveTimer);
  if (!autosaveToggle.checked || !fileHandle || !currentFileName || rawText === originalText) return;
  autoSaveTimer = setTimeout(() => saveLocalFile({ silent: true }), 1000);
}

function localDraftKey() {
  return `org-mode-local-draft:${currentFileName}`;
}

function saveLocalDraft() {
  if (!autosaveToggle.checked || !currentFileName) return;
  try {
    localStorage.setItem(localDraftKey(), JSON.stringify({
      text: rawText,
      sourceText: originalText,
      activeView,
      search: searchInput.value,
      agendaFilter: agendaView.querySelector('#agendaTopLevelFilter')?.value || 'all'
    }));
  } catch (error) { }
}

function removeLocalDraft() {
  if (!currentFileName) return;
  try { localStorage.removeItem(localDraftKey()); } catch (error) { }
}

function persistWorkspaceState() {
  saveLocalDraft();
}

function restoreWorkspaceState() {
  if (!autosaveToggle.checked || !currentFileName) return false;
  let draft;
  try {
    draft = JSON.parse(localStorage.getItem(localDraftKey()) || 'null');
  } catch (error) {
    return false;
  }
  if (!draft || draft.sourceText !== originalText || typeof draft.text !== 'string') return false;

  rawText = draft.text;
  undoStack = [];
  renderOrg(rawText);
  searchInput.value = draft.search || '';
  const filter = agendaView.querySelector('#agendaTopLevelFilter');
  if (filter && draft.agendaFilter) filter.value = draft.agendaFilter;
  setActiveView(draft.activeView === 'agenda' ? 'agenda' : 'tree');
  return true;
}

function formatLocalDate(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function formatLocalTimestamp(date) {
  return `${formatLocalDate(date)}_${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}-${String(date.getSeconds()).padStart(2, '0')}`;
}

function openRecentFileDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(recentFileDatabase, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(recentFileStore);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function rememberFileHandle(handle) {
  await storeHandle(recentFileKey, handle);
  const handles = await getStoredHandle(recentFilesKey) || [];
  const nextHandles = [handle, ...handles.filter(item => item?.name !== handle.name)].slice(0, recentFilesLimit);
  await storeHandle(recentFilesKey, nextHandles);
  await updateRecentFilesUi(nextHandles);
}

async function updateRecentFilesUi(handles = null) {
  if (!hasNativeFileAccess) {
    recentFiles.hidden = true;
    return;
  }

  const recentHandles = handles || await getStoredHandle(recentFilesKey) || [];
  recentFilesList.replaceChildren();
  recentHandles.slice(0, recentFilesLimit).forEach(handle => {
    if (!handle?.name) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'recent-file';
    button.textContent = handle.name;
    button.title = `Öppna ${handle.name}`;
    button.addEventListener('click', () => openRecentFile(handle));
    recentFilesList.append(button);
  });
  recentFiles.hidden = recentFilesList.children.length === 0;
}

async function getRememberedFileHandle() {
  return getStoredHandle(recentFileKey);
}

async function storeHandle(key, handle) {
  if (!handle) return;
  try {
    const database = await openRecentFileDatabase();
    await new Promise((resolve, reject) => {
      const request = database.transaction(recentFileStore, 'readwrite')
        .objectStore(recentFileStore)
        .put(handle, key);
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
    });
    database.close();
  } catch (error) { }
}

async function getStoredHandle(key) {
  try {
    const database = await openRecentFileDatabase();
    const handle = await new Promise((resolve, reject) => {
      const request = database.transaction(recentFileStore, 'readonly')
        .objectStore(recentFileStore)
        .get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return handle;
  } catch (error) {
    return null;
  }
}

async function forgetLastFileHandle() {
  try {
    const database = await openRecentFileDatabase();
    await new Promise((resolve, reject) => {
      const request = database.transaction(recentFileStore, 'readwrite')
        .objectStore(recentFileStore)
        .delete(recentFileKey);
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
    });
    database.close();
  } catch (error) { }
}

async function handleFallbackFile(event) {
  const file = event.target.files?.[0];
  if (file) await loadFromFileObject(file, null);
}

async function loadFromFileObject(file, handle) {
  const text = await file.text();
  rawText = text.replace(/\r\n?/g, '\n');
  originalText = rawText;
  undoStack = [];
  fileHandle = handle;
  currentFileName = file.name || 'tasks.org';
  updateAutosaveUi();
  if (handle) await rememberFileHandle(handle);
  filenameEl.textContent = currentFileName;
  banner.hidden = true;
  welcome.hidden = true;
  treeView.hidden = false;
  renderOrg(rawText);
  if (!restoreWorkspaceState()) setActiveView('tree');
  if (handle && backupDirectoryHandle) {
    try {
      await createOpeningBackup(file);
    } catch (error) {
      showLocalError(`Kunde inte skapa backup: ${error.message || error}`);
    }
  }
  updateFileUi();
}

async function reloadLocalFile() {
  if (!fileHandle) return;
  if (rawText !== originalText) {
    const discard = confirm('Du har osparade ändringar. Läs om filen från disk och kasta dem?');
    if (!discard) return;
  }
  try {
    const file = await fileHandle.getFile();
    await loadFromFileObject(file, fileHandle);
  } catch (error) {
    showLocalError(`Kunde inte läsa om filen: ${error.message || error}`);
  }
}

async function saveLocalFile({ silent = false } = {}) {
  if (!rawText || rawText === originalText) return;
  if (!fileHandle) {
    await saveAsLocalFile();
    return;
  }

  saving = true;
  updateFileUi();
  try {
    const diskFile = await fileHandle.getFile();
    const diskText = (await diskFile.text()).replace(/\r\n?/g, '\n');
    if (diskText !== originalText) {
      showLocalError('Filen har ändrats på disk sedan du öppnade den. Ingenting skrevs över. Läs om filen innan du sparar.');
      return;
    }

    const writable = await fileHandle.createWritable();
    await writable.write(rawText);
    await writable.close();
    markCurrentTextSaved();
    if (!silent) showLocalBanner(`Sparade ${currentFileName} lokalt.`, 'success');
  } catch (error) {
    if (error?.name !== 'AbortError') showLocalError(`Kunde inte spara filen: ${error.message || error}`);
  } finally {
    saving = false;
    updateFileUi();
  }
}

async function saveAsLocalFile() {
  if (!rawText) return;
  saving = true;
  updateFileUi();
  try {
    if (hasNativeFileAccess) {
      const handle = await window.showSaveFilePicker({
        suggestedName: currentFileName || 'tasks.org',
        types: [{
          description: 'Org-mode-fil',
          accept: { 'text/plain': ['.org'] }
        }]
      });
      const writable = await handle.createWritable();
      await writable.write(rawText);
      await writable.close();
      fileHandle = handle;
      await rememberFileHandle(handle);
      updateAutosaveUi();
      const savedFile = await handle.getFile();
      currentFileName = savedFile.name || currentFileName || 'tasks.org';
      filenameEl.textContent = currentFileName;
      markCurrentTextSaved();
      showLocalBanner(`Sparade ${currentFileName} lokalt.`, 'success');
    } else {
      const blob = new Blob([rawText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = currentFileName || 'tasks.org';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      markCurrentTextSaved();
      showLocalBanner(`Nedladdning av ${currentFileName || 'tasks.org'} startad.`, 'success');
    }
  } catch (error) {
    if (error?.name !== 'AbortError') showLocalError(`Kunde inte spara filen: ${error.message || error}`);
  } finally {
    saving = false;
    updateFileUi();
  }
}

function markCurrentTextSaved() {
  originalText = rawText;
  undoStack = [];
  updateEditState();
}

function renderOrg(text) {
  currentModel = parseOrg(text);
  treeView.replaceChildren();

  if (currentModel.preamble.length) {
    const preamble = document.createElement('section');
    preamble.className = 'preamble';
    preamble.append(renderLines(currentModel.preamble, null));
    treeView.append(preamble);
  }

  if (!currentModel.children.length && !currentModel.preamble.length) {
    treeView.innerHTML = '<div class="empty">Filen är tom.</div>';
    agendaView.innerHTML = '<div class="empty">Ingen agenda att visa.</div>';
    return;
  }

  for (const node of currentModel.children) treeView.append(renderNode(node));
  renderAgenda(currentModel);
  updateToggleAllButton();
  applySearch();
  updateEditState();
}

function parseOrg(text) {
  const root = { id: 'root', level: 0, title: '', children: [], body: [], preamble: [], parent: null };
  const stack = [root];
  const lines = text.split('\n');

  lines.forEach((line, index) => {
    const heading = parseHeading(line);
    if (!heading) {
      const target = stack[stack.length - 1];
      if (target === root) root.preamble.push(line);
      else target.body.push(line);
      return;
    }

    while (stack.length > 1 && stack[stack.length - 1].level >= heading.level) stack.pop();
    const parent = stack[stack.length - 1];
    const node = {
      id: `L${index + 1}`,
      lineNumber: index + 1,
      level: heading.level,
      todo: heading.todo,
      title: heading.title,
      tags: heading.tags,
      raw: line,
      body: [],
      children: [],
      parent
    };
    parent.children.push(node);
    stack.push(node);
  });

  return root;
}

function parseHeading(line) {
  const match = line.match(/^(\*+)\s+(.*)$/);
  if (!match) return null;

  let rest = match[2];
  let todo = '';
  const todoMatch = rest.match(/^(TODO|DONE|NEXT|WAITING|CANCELLED)\s+(.*)$/);
  if (todoMatch) {
    todo = todoMatch[1];
    rest = todoMatch[2];
  }

  let tags = '';
  const tagsMatch = rest.match(/^(.*?)(?:\s+)(:[A-Za-z0-9_@#%:.-]+:)\s*$/);
  if (tagsMatch) {
    rest = tagsMatch[1];
    tags = tagsMatch[2];
  }

  return { level: match[1].length, todo, title: rest, tags };
}

function renderNode(node) {
  const article = document.createElement('section');
  article.className = `org-node level-${Math.min(node.level, 6)}`;
  article.dataset.nodeId = node.id;
  article.dataset.searchText = `${node.todo} ${node.title} ${node.tags} ${node.body.join(' ')}`.toLowerCase();

  const row = document.createElement('div');
  row.className = 'heading-row';
  row.title = `Rad ${node.lineNumber}`;

  const fold = document.createElement('button');
  fold.className = 'fold';
  fold.type = 'button';
  fold.setAttribute('aria-label', 'Fäll in eller ut');
  const hasChildrenOrBody = node.children.length > 0 || node.body.some(line => line.trim() !== '');
  if (!hasChildrenOrBody) fold.classList.add('leaf');

  const todo = document.createElement('span');
  if (node.todo) {
    todo.className = `todo editable-todo todo-${node.todo}`;
    todo.textContent = node.todo;
    todo.title = 'Klicka för att växla TODO/DONE';
    todo.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleTodoState(node.id);
    });
  }

  const stars = document.createElement('span');
  stars.className = 'heading-stars';
  stars.textContent = '*'.repeat(node.level);

  const title = document.createElement('span');
  title.className = 'heading-title';
  title.append(renderHeadingInline(node.title));

  const tags = document.createElement('span');
  tags.className = 'tags';
  tags.textContent = node.tags;

  const addChildButton = document.createElement('button');
  addChildButton.type = 'button';
  addChildButton.className = 'edit-node add-child-node';
  addChildButton.textContent = '+ Underuppgift';
  addChildButton.title = 'Lägg till en underuppgift';
  addChildButton.addEventListener('click', (event) => {
    event.stopPropagation();
    openCreateTaskDialog(node.id);
  });

  const moveButton = document.createElement('button');
  moveButton.type = 'button';
  moveButton.className = 'edit-node move-node';
  moveButton.textContent = 'Flytta…';
  moveButton.title = 'Flytta uppgiften och hela dess underträd';
  moveButton.addEventListener('click', (event) => {
    event.stopPropagation();
    openMoveTaskDialog(node.id);
  });

  const siblingIndex = node.parent ? node.parent.children.indexOf(node) : -1;
  const moveUpButton = createVerticalMoveButton('↑', 'Flytta upp en nivågranne', siblingIndex <= 0, () => moveNodeVertically(node.id, -1));
  const moveDownButton = createVerticalMoveButton('↓', 'Flytta ner en nivågranne', siblingIndex < 0 || siblingIndex >= node.parent.children.length - 1, () => moveNodeVertically(node.id, 1));
  const indentButton = createVerticalMoveButton('→', 'Flytta in under föregående uppgift', siblingIndex <= 0, () => moveNodeInHierarchy(node.id));
  const outdentButton = createVerticalMoveButton('←', 'Flytta ut en nivå', !node.parent || node.parent.id === 'root', () => moveNodeOutOfHierarchy(node.id));

  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.className = 'edit-node';
  editButton.textContent = 'Redigera';
  editButton.title = 'Redigera uppgiften';
  editButton.addEventListener('click', (event) => {
    event.stopPropagation();
    openNodeEditor(node.id);
  });

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'edit-node delete-node';
  deleteButton.textContent = 'Ta bort';
  deleteButton.title = 'Ta bort uppgiften och hela dess underträd';
  deleteButton.addEventListener('click', (event) => {
    event.stopPropagation();
    deleteTask(node.id);
  });

  row.append(fold, stars);
  if (node.todo) row.append(todo);
  row.append(title);
  if (node.tags) row.append(tags);
  row.append(moveUpButton, moveDownButton, indentButton, outdentButton, addChildButton, moveButton, editButton, deleteButton);
  article.append(row);

  if (node.body.length) {
    const content = document.createElement('div');
    content.className = 'node-content';
    content.append(renderLines(node.body, node));
    article.append(content);
  }

  if (node.children.length) {
    const children = document.createElement('div');
    children.className = 'children';
    for (const child of node.children) children.append(renderNode(child));
    article.append(children);
  }

  // Every collapsible branch starts collapsed whenever the viewer loads.
  setCollapsed(article, hasChildrenOrBody);

  fold.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleNode(article);
    updateToggleAllButton();
  });
  row.addEventListener('dblclick', () => {
    toggleNode(article);
    updateToggleAllButton();
  });

  return article;
}

function createVerticalMoveButton(symbol, title, disabled, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'edit-node vertical-move-node';
  button.textContent = symbol;
  button.title = title;
  button.disabled = disabled;
  button.addEventListener('click', event => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

function moveNodeVertically(nodeId, direction) {
  const node = findNodeById(nodeId);
  if (!node || !node.parent) return;

  const siblings = node.parent.children;
  const currentIndex = siblings.indexOf(node);
  const targetIndex = currentIndex + direction;
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= siblings.length) return;

  const targetNode = siblings[targetIndex];
  const lines = rawText.split('\n');
  const currentStart = node.lineNumber - 1;
  const currentEnd = subtreeEndLineIndex(node, lines);
  const targetStart = targetNode.lineNumber - 1;
  const targetEnd = subtreeEndLineIndex(targetNode, lines);
  const firstStart = Math.min(currentStart, targetStart);
  const lastEnd = Math.max(currentEnd, targetEnd);
  const currentBlock = lines.slice(currentStart, currentEnd);
  const targetBlock = lines.slice(targetStart, targetEnd);
  const between = lines.slice(Math.min(currentEnd, targetEnd), Math.max(currentStart, targetStart));
  const replacement = direction < 0
    ? [...currentBlock, ...between, ...targetBlock]
    : [...targetBlock, ...between, ...currentBlock];

  lines.splice(firstStart, lastEnd - firstStart, ...replacement);
  commitLocalChange(lines.join('\n'), node.id);
}

function moveNodeInHierarchy(nodeId) {
  const node = findNodeById(nodeId);
  if (!node || !node.parent) return;
  const siblingIndex = node.parent.children.indexOf(node);
  if (siblingIndex <= 0) return;
  moveNodeToHierarchyPosition(node, node.parent.children[siblingIndex - 1], node.level + 1, 'last');
}

function moveNodeOutOfHierarchy(nodeId) {
  const node = findNodeById(nodeId);
  if (!node || !node.parent || node.parent.id === 'root') return;
  const parent = node.parent;
  moveNodeToHierarchyPosition(node, parent.parent, parent.level, parent);
}

function moveNodeToHierarchyPosition(node, targetParent, newLevel, insertionAnchor = targetParent) {
  const lines = rawText.split('\n');
  const start = node.lineNumber - 1;
  const end = subtreeEndLineIndex(node, lines);
  const block = lines.slice(start, end).map(line => {
    const heading = line.match(/^(\*+)(\s+.*)$/);
    if (!heading) return line;
    const levelDelta = newLevel - node.level;
    return `${'*'.repeat(Math.max(1, heading[1].length + levelDelta))}${heading[2]}`;
  });

  let insertAt = subtreeEndLineIndex(insertionAnchor, lines);
  const remaining = [...lines];
  remaining.splice(start, end - start);
  if (insertAt > start) insertAt -= end - start;
  insertAt = Math.max(0, Math.min(insertAt, remaining.length));

  const insertion = [...block];
  if (insertAt > 0 && remaining[insertAt - 1] !== '' && insertion[0] !== '') insertion.unshift('');
  if (insertAt < remaining.length && remaining[insertAt] !== '' && insertion[insertion.length - 1] !== '') insertion.push('');
  remaining.splice(insertAt, 0, ...insertion);

  const headingOffset = insertion.findIndex(line => /^\*+\s+/.test(line));
  commitLocalChange(remaining.join('\n'), `L${insertAt + headingOffset + 1}`);
}

function renderLines(lines, node = null) {
  const fragment = document.createDocumentFragment();
  lines.forEach((line, bodyIndex) => {
    const div = document.createElement('div');
    div.className = 'org-line';
    div.dataset.raw = line;
    div.innerHTML = highlightLine(line, Boolean(node));

    if (node && /\[[ Xx-]\]/.test(line)) {
      div.addEventListener('click', (event) => {
        const checkbox = event.target.closest('.clickable-checkbox');
        if (!checkbox) return;
        event.stopPropagation();
        toggleBodyCheckbox(node.id, bodyIndex);
      });
    }

    fragment.append(div);
  });
  return fragment;
}

function highlightLine(line, interactiveCheckbox = false) {
  const escaped = escapeHtml(line);
  if (/^\s*#(?!\+)/.test(line)) return `<span class="comment">${escaped || '&nbsp;'}</span>`;

  let out = escaped || '&nbsp;';

  if (/^\s*#\+[A-Za-z_]+:/.test(line)) {
    out = out.replace(/^(\s*)(#\+[A-Za-z_]+:)/i, '$1<span class="kw">$2</span>');
  }
  if (/^\s*:[A-Za-z0-9_@#%]+:\s*$/.test(line)) {
    return `<span class="drawer">${escaped}</span>`;
  }
  if (/^\s*:[A-Za-z0-9_@#%]+:\s+/.test(line)) {
    out = out.replace(/^(\s*)(:[A-Za-z0-9_@#%]+:)/, '$1<span class="property">$2</span>');
  }

  out = out.replace(/(\[[#A-C]\])/g, '<span class="priority">$1</span>');
  const checkboxClass = interactiveCheckbox ? 'checkbox clickable-checkbox' : 'checkbox';
  out = out.replace(/(\[[ Xx-]\])/g, `<span class="${checkboxClass}">$1</span>`);
  out = out.replace(/(&lt;\d{4}-\d{2}-\d{2}[^&]*?&gt;|\[\d{4}-\d{2}-\d{2}[^\]]*?\])/g, '<span class="timestamp">$1</span>');
  const orgLinks = [];
  out = out.replace(/\[\[([^\]]+)\](?:\[([^\]]*)\])?\]/g, (match, target, label) => {
    const safeHref = safeHeadingHref(target);
    if (!safeHref) return `<span class="link">${match}</span>`;
    const placeholder = `__ORG_LINK_${orgLinks.length}__`;
    orgLinks.push(createExternalLinkMarkup(safeHref, label || target));
    return placeholder;
  });
  out = out.replace(/(https?:\/\/[^\s<]+)/g, match => createExternalLinkMarkup(match, match));
  out = out.replace(/(^|\s)(~[^~\n]+~|=[^=\n]+=)(?=\s|$|[.,;:!?])/g, '$1<span class="code">$2</span>');
  out = out.replace(/(^|\s)(\*[^*\n]+\*)(?=\s|$|[.,;:!?])/g, '$1<span class="bold">$2</span>');
  orgLinks.forEach((link, index) => {
    out = out.replace(`__ORG_LINK_${index}__`, link);
  });
  return out;
}

function createExternalLinkMarkup(href, label) {
  return `<a class="link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

function highlightInline(text) {
  return highlightLine(text).replace(/^&nbsp;$/, '');
}

function renderHeadingInline(text) {
  const fragment = document.createDocumentFragment();
  const linkRegex = /\[\[([^\]\n]+)\](?:\[([^\]\n]*)\])?\]/g;
  let cursor = 0;
  let match;

  while ((match = linkRegex.exec(text)) !== null) {
    appendHighlightedHeadingText(fragment, text.slice(cursor, match.index));

    const target = match[1];
    const label = match[2] !== undefined && match[2] !== '' ? match[2] : target;
    const safeHref = safeHeadingHref(target);
    const link = document.createElement(safeHref ? 'a' : 'span');
    link.className = 'org-heading-link';
    link.textContent = label;
    link.title = target;

    if (safeHref) {
      link.href = safeHref;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.addEventListener('click', event => event.stopPropagation());
      link.addEventListener('dblclick', event => event.stopPropagation());
    }

    fragment.append(link);
    cursor = linkRegex.lastIndex;
  }

  appendHighlightedHeadingText(fragment, text.slice(cursor));
  return fragment;
}

function appendHighlightedHeadingText(fragment, text) {
  if (!text) return;
  const span = document.createElement('span');
  span.innerHTML = highlightInline(text);
  while (span.firstChild) fragment.append(span.firstChild);
}

function safeHeadingHref(target) {
  try {
    const url = new URL(target);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setCollapsed(article, collapsed) {
  article.classList.toggle('collapsed', collapsed);
  const fold = article.querySelector(':scope > .heading-row > .fold');
  if (fold) {
    fold.textContent = collapsed ? '▶' : '▼';
    fold.setAttribute('aria-expanded', String(!collapsed));
  }
}

function toggleNode(article) {
  // Opening a task shows that task's own body and its immediate child headings.
  // Child tasks keep their own collapsed state and must be opened separately.
  setCollapsed(article, !article.classList.contains('collapsed'));
}

function toggleAll() {
  const collapsible = [...treeView.querySelectorAll('.org-node')].filter(article => {
    const fold = article.querySelector(':scope > .heading-row > .fold');
    return fold && !fold.classList.contains('leaf');
  });
  if (!collapsible.length) return;

  const shouldExpand = collapsible.some(article => article.classList.contains('collapsed'));
  collapsible.forEach(article => setCollapsed(article, !shouldExpand));
  updateToggleAllButton();
}

function updateToggleAllButton() {
  const collapsible = [...treeView.querySelectorAll('.org-node')].filter(article => {
    const fold = article.querySelector(':scope > .heading-row > .fold');
    return fold && !fold.classList.contains('leaf');
  });
  const hasCollapsed = collapsible.some(article => article.classList.contains('collapsed'));
  toggleAllButton.textContent = hasCollapsed ? 'Öppna alla' : 'Stäng alla';
  toggleAllButton.title = hasCollapsed ? 'Öppna alla grenar' : 'Stäng alla grenar';
  toggleAllButton.disabled = activeView !== 'tree' || collapsible.length === 0;
}

function setActiveView(view) {
  activeView = view;
  const treeActive = view === 'tree';
  treeView.hidden = !treeActive;
  agendaView.hidden = treeActive;
  treeTab.classList.toggle('active', treeActive);
  agendaTab.classList.toggle('active', !treeActive);
  treeTab.setAttribute('aria-selected', String(treeActive));
  agendaTab.setAttribute('aria-selected', String(!treeActive));
  searchInput.placeholder = treeActive ? 'Sök i filen…' : 'Sök i agendan…';
  updateToggleAllButton();
  applySearch();
  persistWorkspaceState();
}

function renderAgenda(model) {
  agendaView.replaceChildren();
  const events = collectAgendaEvents(model);
  agendaView.agendaEvents = events;

  const filterBar = document.createElement('div');
  filterBar.className = 'agenda-filter-bar';
  const filterLabel = document.createElement('label');
  filterLabel.textContent = 'Visa toppnivå';
  filterLabel.htmlFor = 'agendaTopLevelFilter';
  const filter = document.createElement('select');
  filter.id = 'agendaTopLevelFilter';
  filter.className = 'agenda-filter';
  filter.innerHTML = '<option value="all">Alla rubriker</option>';
  for (const node of model.children) {
    const option = document.createElement('option');
    option.value = node.id;
    option.textContent = plainHeadingLabel(node.title);
    filter.append(option);
  }
  filter.addEventListener('change', () => {
    applySearch();
    persistWorkspaceState();
  });
  filterBar.append(filterLabel, filter);
  agendaView.append(filterBar);

  const summary = document.createElement('div');
  summary.className = 'agenda-summary';
  const today = new Date();
  const todayKey = localDateKey(today);
  const overdueCount = events.filter(event => event.dateKey < todayKey).length;
  const todayCount = events.filter(event => event.dateKey === todayKey).length;
  summary.innerHTML = `<span class="agenda-total"><strong>${events.length}</strong> poster</span><span class="agenda-today"><strong>${todayCount}</strong> idag</span><span class="agenda-overdue"><strong>${overdueCount}</strong> försenade</span>`;
  agendaView.append(summary);

  if (!events.length) {
    agendaView.insertAdjacentHTML('beforeend', '<div class="empty">Inga SCHEDULED-, DEADLINE- eller aktiva datum hittades.</div>');
    return;
  }

  const groups = groupAgendaEvents(events);
  for (const group of groups) {
    const section = document.createElement('section');
    section.className = 'agenda-group';

    const heading = document.createElement('h2');
    heading.textContent = group.label;
    section.append(heading);

    const list = document.createElement('div');
    list.className = 'agenda-list';
    for (const event of group.events) list.append(renderAgendaItem(event));
    section.append(list);
    agendaView.append(section);
  }
}
function collectAgendaEvents(root) {
  const events = [];
  const seen = new Set();

  walkNodes(root, node => {
    if (node.todo === 'DONE' || node.todo === 'CANCELLED') return;
    const sourceLines = [node.raw, ...node.body];
    for (const line of sourceLines) {
      const scheduled = line.match(/\bSCHEDULED:\s*(<\d{4}-\d{2}-\d{2}[^>]*>)/i);
      const deadline = line.match(/\bDEADLINE:\s*(<\d{4}-\d{2}-\d{2}[^>]*>)/i);

      if (scheduled) addAgendaEvent(events, seen, node, 'SCHEDULED', scheduled[1]);
      if (deadline) addAgendaEvent(events, seen, node, 'DEADLINE', deadline[1]);

      if (!scheduled && !deadline) {
        const timestamps = line.match(/<\d{4}-\d{2}-\d{2}[^>]*>/g) || [];
        for (const timestamp of timestamps) addAgendaEvent(events, seen, node, 'DATUM', timestamp);
      }
    }
  });

  return events.sort((a, b) => a.dateKey - b.dateKey || a.timeMinutes - b.timeMinutes || agendaTypeOrder(a.type) - agendaTypeOrder(b.type) || a.node.lineNumber - b.node.lineNumber);
}

function walkNodes(root, visitor) {
  for (const child of root.children || []) {
    visitor(child);
    walkNodes(child, visitor);
  }
}

function addAgendaEvent(events, seen, node, type, timestamp) {
  const parsed = parseOrgTimestamp(timestamp);
  if (!parsed) return;
  const key = `${node.id}|${type}|${parsed.dateKey}|${parsed.timeMinutes}`;
  if (seen.has(key)) return;
  seen.add(key);
  events.push({
    node,
    topLevelNode: getTopLevelNode(node),
    type,
    timestamp,
    date: parsed.date,
    dateKey: parsed.dateKey,
    timeMinutes: parsed.timeMinutes,
    hasTime: parsed.hasTime
  });
}

function getTopLevelNode(node) {
  let current = node;
  while (current.parent && current.parent.id !== 'root') current = current.parent;
  return current;
}

function parseOrgTimestamp(timestamp) {
  const dateMatch = timestamp.match(/<(\d{4})-(\d{2})-(\d{2})/);
  if (!dateMatch) return null;

  const timeMatch = timestamp.match(/(?:^|\s)(\d{1,2}):(\d{2})(?:-\d{1,2}:\d{2})?(?=\s|>)/);
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]) - 1;
  const day = Number(dateMatch[3]);
  const hour = timeMatch ? Number(timeMatch[1]) : 12;
  const minute = timeMatch ? Number(timeMatch[2]) : 0;
  const date = new Date(year, month, day, hour, minute, 0, 0);

  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  return {
    date,
    dateKey: year * 10000 + (month + 1) * 100 + day,
    timeMinutes: timeMatch ? hour * 60 + minute : 12 * 60,
    hasTime: Boolean(timeMatch)
  };
}

function agendaTypeOrder(type) {
  if (type === 'DEADLINE') return 0;
  if (type === 'SCHEDULED') return 1;
  return 2;
}

function groupAgendaEvents(events) {
  const today = startOfDay(new Date());
  const todayKey = localDateKey(today);
  const tomorrowKey = localDateKey(addDays(today, 1));
  const inSevenDaysKey = localDateKey(addDays(today, 7));
  const groups = [
    { key: 'overdue', label: 'Försenat', events: [] },
    { key: 'today', label: 'Idag', events: [] },
    { key: 'tomorrow', label: 'Imorgon', events: [] },
    { key: 'week', label: 'Nästa 7 dagar', events: [] },
    { key: 'later', label: 'Senare', events: [] }
  ];

  for (const event of events) {
    if (event.dateKey < todayKey) groups[0].events.push(event);
    else if (event.dateKey === todayKey) groups[1].events.push(event);
    else if (event.dateKey === tomorrowKey) groups[2].events.push(event);
    else if (event.dateKey <= inSevenDaysKey) groups[3].events.push(event);
    else groups[4].events.push(event);
  }

  return groups.filter(group => group.events.length);
}

function renderAgendaItem(event) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'agenda-item';
  button.dataset.topLevelId = event.topLevelNode.id;
  button.dataset.searchText = `${event.node.todo} ${event.node.title} ${event.node.tags} ${event.type} ${formatAgendaDate(event)}`.toLowerCase();

  const date = document.createElement('span');
  date.className = 'agenda-date';
  date.textContent = formatAgendaDate(event);

  const type = document.createElement('span');
  type.className = `agenda-type type-${event.type.toLowerCase()}`;
  type.textContent = event.type === 'DATUM' ? 'DATUM' : event.type;

  const title = document.createElement('span');
  title.className = 'agenda-title';
  if (event.node.todo) {
    const todo = document.createElement('span');
    todo.className = `todo agenda-todo todo-${event.node.todo}`;
    todo.textContent = event.node.todo;
    title.append(todo, document.createTextNode(' '));
  }
  const titleText = document.createElement('span');
  titleText.className = 'agenda-title-text';
  titleText.textContent = event.node.title;
  title.append(titleText);

  const path = document.createElement('span');
  path.className = 'agenda-path';
  path.textContent = nodePath(event.node);

  button.append(date, type, title, path);
  button.addEventListener('click', () => revealNode(event.node.id));
  return button;
}

function formatAgendaDate(event) {
  const currentYear = new Date().getFullYear();
  const options = { weekday: 'short', day: 'numeric', month: 'short' };
  if (event.date.getFullYear() !== currentYear) options.year = 'numeric';
  const datePart = new Intl.DateTimeFormat('sv-SE', options).format(event.date);
  if (!event.hasTime) return datePart;
  const timePart = new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' }).format(event.date);
  return `${datePart} ${timePart}`;
}

function nodePath(node) {
  const titles = [];
  let current = node.parent;
  while (current && current.id !== 'root') {
    titles.unshift(current.title);
    current = current.parent;
  }
  return titles.join(' › ');
}

function revealNode(nodeId) {
  setActiveView('tree');
  const article = treeView.querySelector(`.org-node[data-node-id="${CSS.escape(nodeId)}"]`);
  if (!article) return;

  let current = article.parentElement?.closest('.org-node');
  while (current) {
    setCollapsed(current, false);
    current = current.parentElement?.closest('.org-node');
  }
  // Agenda navigation opens the selected task and the path to it, but keeps
  // all descendant tasks collapsed so they can be opened individually.
  setCollapsed(article, false);
  updateToggleAllButton();
  article.classList.add('agenda-focus');
  article.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => article.classList.remove('agenda-focus'), 1600);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function localDateKey(date) {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function applySearch() {
  const query = searchInput.value.trim().toLowerCase();

  if (activeView === 'agenda') {
    const selectedTopLevel = agendaView.querySelector('#agendaTopLevelFilter')?.value || 'all';
    const events = agendaView.agendaEvents || [];
    const visibleEvents = events.filter(event => selectedTopLevel === 'all' || event.topLevelNode.id === selectedTopLevel);
    const todayKey = localDateKey(new Date());
    const summary = agendaView.querySelector('.agenda-summary');
    if (summary) {
      summary.querySelector('.agenda-total strong').textContent = visibleEvents.length;
      summary.querySelector('.agenda-today strong').textContent = visibleEvents.filter(event => event.dateKey === todayKey).length;
      summary.querySelector('.agenda-overdue strong').textContent = visibleEvents.filter(event => event.dateKey < todayKey).length;
    }
    agendaView.querySelectorAll('.agenda-item').forEach(item => {
      const matchesTopLevel = selectedTopLevel === 'all' || item.dataset.topLevelId === selectedTopLevel;
      const matchesSearch = !query || (item.dataset.searchText || '').includes(query);
      item.classList.toggle('search-hidden', !matchesTopLevel || !matchesSearch);
    });
    agendaView.querySelectorAll('.agenda-group').forEach(group => {
      const hasVisibleItems = [...group.querySelectorAll('.agenda-item')].some(item => !item.classList.contains('search-hidden'));
      group.classList.toggle('search-hidden', !hasVisibleItems);
    });
    return;
  }

  const nodes = [...treeView.querySelectorAll('.org-node')];
  const lines = [...treeView.querySelectorAll('.org-line')];

  // Restore syntax before applying highlights.
  lines.forEach(line => {
    const interactive = Boolean(line.closest('.org-node'));
    line.innerHTML = highlightLine(line.dataset.raw || '', interactive);
  });
  treeView.querySelectorAll('.heading-title').forEach((el) => {
    const article = el.closest('.org-node');
    const id = article?.dataset.nodeId;
    const nodeLine = id ? rawText.split('\n')[Number(id.slice(1)) - 1] : '';
    const parsed = nodeLine ? parseHeading(nodeLine) : null;
    if (parsed) el.innerHTML = highlightInline(parsed.title);
  });

  nodes.forEach(node => node.classList.remove('search-hidden'));
  if (!query) return;

  // Keep matching nodes and their ancestors visible. Open ancestors while searching.
  for (const node of nodes) {
    const ownMatch = (node.dataset.searchText || '').includes(query);
    const descendantMatch = [...node.querySelectorAll(':scope .org-node')].some(child => (child.dataset.searchText || '').includes(query));
    if (!ownMatch && !descendantMatch) node.classList.add('search-hidden');
    if (descendantMatch) setCollapsed(node, false);
  }

  treeView.querySelectorAll('.org-node:not(.search-hidden)').forEach(node => {
    if ((node.dataset.searchText || '').includes(query)) {
      markTextMatches(node.querySelector(':scope > .heading-row .heading-title'), query);
      node.querySelectorAll(':scope > .node-content .org-line').forEach(line => markTextMatches(line, query));
    }
  });
  updateToggleAllButton();
}

function markTextMatches(element, query) {
  if (!element || !query) return;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  for (const textNode of textNodes) {
    const value = textNode.nodeValue;
    const lower = value.toLowerCase();
    let start = lower.indexOf(query);
    if (start === -1) continue;

    const frag = document.createDocumentFragment();
    let cursor = 0;
    while (start !== -1) {
      frag.append(document.createTextNode(value.slice(cursor, start)));
      const mark = document.createElement('mark');
      mark.className = 'search-hit';
      mark.textContent = value.slice(start, start + query.length);
      frag.append(mark);
      cursor = start + query.length;
      start = lower.indexOf(query, cursor);
    }
    frag.append(document.createTextNode(value.slice(cursor)));
    textNode.replaceWith(frag);
  }
}


function findNodeById(nodeId) {
  let found = null;
  if (!currentModel) return null;
  walkNodes(currentModel, node => {
    if (!found && node.id === nodeId) found = node;
  });
  return found;
}

function buildHeadingLine(node, values) {
  const titleValue = (values.title || '').trim();
  const todoValue = (values.todo || '').trim();
  const tagsValue = normalizeTags(values.tags || '');
  return `${'*'.repeat(node.level)} ${todoValue ? `${todoValue} ` : ''}${titleValue}${tagsValue ? ` ${tagsValue}` : ''}`;
}

function normalizeTags(value) {
  const tags = value
    .replace(/^:+|:+$/g, '')
    .split(/[\s,:]+/)
    .map(tag => tag.trim())
    .filter(Boolean);
  return tags.length ? `:${tags.join(':')}:` : '';
}

function planningDate(lines, type) {
  const regex = new RegExp(`\\b${type}:\\s*<(\\d{4}-\\d{2}-\\d{2})(?:[^>]*?\\s(\\d{1,2}:\\d{2}))?[^>]*>`, 'i');
  for (const line of lines) {
    const match = line.match(regex);
    if (match) return match[2] ? `${match[1]}T${match[2].padStart(5, '0')}` : match[1];
  }
  return '';
}

function setPlanningDate(lines, type, value) {
  const list = [...lines];
  const [dateValue, timeValue] = value ? value.split('T') : ['', ''];
  const regex = new RegExp(`\\b${type}:\\s*<(\\d{4}-\\d{2}-\\d{2})([^>]*)>`, 'i');
  const index = list.findIndex(line => regex.test(line));

  if (index >= 0) {
    if (value) {
      list[index] = list[index].replace(regex, (_, date, suffix) => {
        const withoutTime = suffix.replace(/\s\d{1,2}:\d{2}(?=\s|$)/, '');
        return `${type}: <${dateValue}${withoutTime}${timeValue ? ` ${timeValue}` : ''}>`;
      });
    } else {
      list[index] = list[index].replace(regex, '').replace(/\s{2,}/g, ' ').trimEnd();
      if (!list[index].trim()) list.splice(index, 1);
    }
    return list;
  }

  if (value) {
    const insertion = `${type}: <${dateValue}${timeValue ? ` ${timeValue}` : ''}>`;
    const planningIndex = list.findIndex(line => /\b(?:SCHEDULED|DEADLINE):\s*</i.test(line));
    if (planningIndex >= 0) list.splice(planningIndex + 1, 0, insertion);
    else list.unshift(insertion);
  }
  return list;
}

function openNodeEditor(nodeId) {
  const node = findNodeById(nodeId);
  if (!node) return;
  editingNodeId = node.id;
  editTitle.value = node.title;
  editTodo.value = node.todo || '';
  editTags.value = node.tags ? node.tags.replace(/^:|:$/g, '').replaceAll(':', ' ') : '';
  editScheduled.value = planningDate(node.body, 'SCHEDULED');
  editDeadline.value = planningDate(node.body, 'DEADLINE');
  editScheduled.dataset.initial = editScheduled.value;
  editDeadline.dataset.initial = editDeadline.value;
  editBody.value = node.body.join('\n');
  editDialog.showModal();
  requestAnimationFrame(() => editTitle.focus());
}

function openCreateTaskDialog(parentNodeId = null) {
  const parent = parentNodeId ? findNodeById(parentNodeId) : null;
  createParentNodeId = parent ? parent.id : null;
  createTarget.textContent = parent
    ? `Ny underuppgift till: ${plainHeadingLabel(parent.title)}`
    : 'Ny uppgift på toppnivå';
  createTitle.value = '';
  createTodo.value = 'TODO';
  createTags.value = '';
  createScheduled.value = '';
  createDeadline.value = '';
  createBody.value = '';
  createDialog.showModal();
  requestAnimationFrame(() => createTitle.focus());
}

function plainHeadingLabel(title) {
  return title.replace(/\[\[([^\]]+)\](?:\[([^\]]*)\])?\]/g, (_, target, label) => label || target);
}

function openMoveTaskDialog(nodeId) {
  const node = findNodeById(nodeId);
  if (!node) return;

  movingNodeId = node.id;
  moveTaskLabel.textContent = `Flytta: ${plainHeadingLabel(node.title)}`;
  moveParent.replaceChildren();

  const topOption = document.createElement('option');
  topOption.value = 'root';
  topOption.textContent = 'Toppnivå';
  moveParent.append(topOption);

  const excluded = new Set();
  collectSubtreeIds(node, excluded);
  walkNodes(currentModel, candidate => {
    if (excluded.has(candidate.id)) return;
    const option = document.createElement('option');
    option.value = candidate.id;
    option.textContent = `${'  '.repeat(Math.max(0, candidate.level - 1))}↳ ${plainHeadingLabel(candidate.title)}`;
    moveParent.append(option);
  });

  moveParent.value = node.parent && node.parent.id !== 'root' ? node.parent.id : 'root';
  movePosition.value = 'last';
  moveDialog.showModal();
  requestAnimationFrame(() => moveParent.focus());
}

function collectSubtreeIds(node, target) {
  target.add(node.id);
  for (const child of node.children) collectSubtreeIds(child, target);
}

function saveTaskMove(event) {
  event.preventDefault();
  const node = findNodeById(movingNodeId);
  if (!node) {
    moveDialog.close();
    return;
  }

  const targetParent = moveParent.value === 'root' ? currentModel : findNodeById(moveParent.value);
  if (!targetParent) return;

  const excluded = new Set();
  collectSubtreeIds(node, excluded);
  if (targetParent.id !== 'root' && excluded.has(targetParent.id)) return;

  const lines = rawText.split('\n');
  const start = node.lineNumber - 1;
  let end = subtreeEndLineIndex(node, lines);
  while (end > start + 1 && lines[end - 1].trim() === '') end -= 1;

  const block = lines.slice(start, end);
  const newLevel = targetParent.id === 'root' ? 1 : targetParent.level + 1;
  const levelDelta = newLevel - node.level;
  const movedBlock = block.map(line => {
    const heading = line.match(/^(\*+)(\s+.*)$/);
    if (!heading) return line;
    const adjustedLevel = Math.max(1, heading[1].length + levelDelta);
    return `${'*'.repeat(adjustedLevel)}${heading[2]}`;
  });

  let insertAt;
  if (targetParent.id === 'root') {
    insertAt = movePosition.value === 'first'
      ? currentModel.preamble.length
      : trailingContentIndex(lines);
  } else if (movePosition.value === 'first') {
    insertAt = targetParent.lineNumber + targetParent.body.length;
  } else {
    insertAt = subtreeEndLineIndex(targetParent, lines);
  }

  const removedCount = end - start;
  const remaining = [...lines];
  remaining.splice(start, removedCount);
  if (insertAt > start) insertAt -= removedCount;
  insertAt = Math.max(0, Math.min(insertAt, remaining.length));

  const insertion = [...movedBlock];
  if (insertAt > 0 && remaining[insertAt - 1] !== '' && insertion[0] !== '') insertion.unshift('');
  if (insertAt < remaining.length && remaining[insertAt] !== '' && insertion[insertion.length - 1] !== '') insertion.push('');

  remaining.splice(insertAt, 0, ...insertion);
  moveDialog.close();

  const headingOffset = insertion.findIndex(line => /^\*+\s+/.test(line));
  const newNodeId = `L${insertAt + headingOffset + 1}`;
  commitLocalChange(remaining.join('\n'), newNodeId);
}

function saveNewTask(event) {
  event.preventDefault();
  const parent = createParentNodeId ? findNodeById(createParentNodeId) : null;
  const level = parent ? parent.level + 1 : 1;
  const title = createTitle.value.trim();
  if (!title) return;

  let bodyLines = createBody.value === '' ? [] : createBody.value.replace(/\r\n?/g, '\n').split('\n');
  if (createScheduled.value) bodyLines = setPlanningDate(bodyLines, 'SCHEDULED', createScheduled.value);
  if (createDeadline.value) bodyLines = setPlanningDate(bodyLines, 'DEADLINE', createDeadline.value);

  const heading = `${'*'.repeat(level)} ${createTodo.value ? `${createTodo.value} ` : ''}${title}${normalizeTags(createTags.value) ? ` ${normalizeTags(createTags.value)}` : ''}`;
  const taskLines = [heading, ...bodyLines];
  const lines = rawText.split('\n');
  let insertAt = parent ? subtreeEndLineIndex(parent, lines) : trailingContentIndex(lines);

  if (insertAt > 0 && lines[insertAt - 1] !== '') {
    taskLines.unshift('');
  }

  lines.splice(insertAt, 0, ...taskLines);
  const nextText = lines.join('\n');
  createDialog.close();

  const newHeadingLineNumber = insertAt + taskLines.findIndex(line => /^\*+\s+/.test(line)) + 1;
  const newNodeId = `L${newHeadingLineNumber}`;
  commitLocalChange(nextText, newNodeId);
}

function trailingContentIndex(lines) {
  if (lines.length && lines[lines.length - 1] === '') return lines.length - 1;
  return lines.length;
}

function subtreeEndLineIndex(node, lines) {
  for (let i = node.lineNumber; i < lines.length; i += 1) {
    const heading = parseHeading(lines[i]);
    if (heading && heading.level <= node.level) return i;
  }
  return trailingContentIndex(lines);
}

function saveNodeEdit(event) {
  event.preventDefault();
  const node = findNodeById(editingNodeId);
  if (!node) {
    editDialog.close();
    return;
  }

  const lines = rawText.split('\n');
  const headingIndex = node.lineNumber - 1;
  const bodyStart = headingIndex + 1;
  const bodyEnd = bodyStart + node.body.length;
  let bodyLines = editBody.value === '' ? [] : editBody.value.replace(/\r\n?/g, '\n').split('\n');
  if (editScheduled.value !== (editScheduled.dataset.initial || '')) {
    bodyLines = setPlanningDate(bodyLines, 'SCHEDULED', editScheduled.value);
  }
  if (editDeadline.value !== (editDeadline.dataset.initial || '')) {
    bodyLines = setPlanningDate(bodyLines, 'DEADLINE', editDeadline.value);
  }

  const nextHeading = buildHeadingLine(node, {
    title: editTitle.value,
    todo: editTodo.value,
    tags: editTags.value
  });
  lines[headingIndex] = nextHeading;
  lines.splice(bodyStart, bodyEnd - bodyStart, ...bodyLines);
  const nextText = lines.join('\n');

  editDialog.close();
  commitLocalChange(nextText, node.id);
}

function deleteTask(nodeId) {
  const node = findNodeById(nodeId);
  if (!node) return;

  const includesChildren = node.children.length > 0;
  const message = includesChildren
    ? `Ta bort "${plainHeadingLabel(node.title)}" och dess ${node.children.length === 1 ? 'underuppgift' : 'underuppgifter'}?`
    : `Ta bort "${plainHeadingLabel(node.title)}"?`;
  if (!confirm(message)) return;

  const lines = rawText.split('\n');
  const start = node.lineNumber - 1;
  const end = subtreeEndLineIndex(node, lines);
  lines.splice(start, end - start);
  commitLocalChange(lines.join('\n'));
}

function toggleTodoState(nodeId) {
  const node = findNodeById(nodeId);
  if (!node) return;
  const lines = rawText.split('\n');
  const nextTodo = node.todo === 'DONE' ? 'TODO' : 'DONE';
  lines[node.lineNumber - 1] = buildHeadingLine(node, {
    title: node.title,
    todo: nextTodo,
    tags: node.tags
  });
  commitLocalChange(lines.join('\n'), node.id);
}

function toggleBodyCheckbox(nodeId, bodyIndex) {
  const node = findNodeById(nodeId);
  if (!node || bodyIndex < 0 || bodyIndex >= node.body.length) return;
  const globalIndex = node.lineNumber + bodyIndex;
  const lines = rawText.split('\n');
  const source = lines[globalIndex];
  if (typeof source !== 'string') return;
  const next = source.replace(/\[([ Xx-])\]/, (_, state) => {
    return state === ' ' || state === '-' ? '[X]' : '[ ]';
  });
  if (next === source) return;
  lines[globalIndex] = next;
  commitLocalChange(lines.join('\n'), node.id);
}

function commitLocalChange(nextText, focusNodeId = null) {
  if (nextText === rawText) return;
  undoStack.push(rawText);
  rawText = nextText;
  renderOrg(rawText);
  updateEditState();
  saveLocalDraft();
  scheduleAutoSave();
  if (focusNodeId) revealNode(focusNodeId);
}

function undoLastChange() {
  if (!undoStack.length) return;
  rawText = undoStack.pop();
  renderOrg(rawText);
  updateEditState();
}

function updateEditState() {
  const dirty = Boolean(currentFileName) && rawText !== originalText;
  dirtyState.hidden = !currentFileName;
  dirtyState.className = `dirty-state ${dirty ? 'unsaved' : 'saved'}`;
  dirtyState.textContent = dirty
    ? undoStack.length ? `Osparade ändringar (${undoStack.length})` : 'Osparade ändringar'
    : 'Sparad';
  dirtyState.title = dirty ? 'Det finns ändringar som inte har sparats i filen' : 'Arbetsytan är sparad';
  undoButton.disabled = undoStack.length === 0;
  showSourceButton.disabled = !rawText;
  document.title = `${dirty ? '● ' : ''}${filenameEl.textContent || 'Org-mode'} – Org-mode Local`;
  updateFileUi();
}

function showCurrentSource() {
  sourceText.value = rawText;
  sourceDialog.showModal();
  sourceText.scrollTop = 0;
}





function updateFileUi() {
  const loaded = Boolean(currentFileName);
  const dirty = loaded && rawText !== originalText;
  searchInput.disabled = !loaded;
  newTaskButton.disabled = !loaded;
  toggleAllButton.disabled = !loaded;
  showSourceButton.disabled = !loaded;
  saveAsFileButton.disabled = !loaded || saving;
  saveFileButton.disabled = !loaded || !dirty || saving;
  reloadButton.disabled = !loaded || !fileHandle || saving;

  fileState.className = 'file-state';
  if (saving) {
    fileState.classList.add('saving');
    fileState.textContent = 'Sparar…';
  } else if (loaded && fileHandle) {
    fileState.classList.add('writable');
    fileState.textContent = 'Direkt filåtkomst';
  } else if (loaded) {
    fileState.classList.add('fallback');
    fileState.textContent = 'Nedladdningsläge';
  } else {
    fileState.textContent = 'Lokal fil';
  }
}

function showLocalBanner(message, type = '') {
  banner.hidden = false;
  banner.className = 'banner';
  if (type === 'success') banner.classList.add('success');
  if (type === 'error') banner.classList.add('error-banner');
  banner.textContent = message;
}

function showLocalError(message) {
  showLocalBanner(message, 'error');
}
