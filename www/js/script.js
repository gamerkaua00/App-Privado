// ======================================================
// GHOSTMSG V7 - KMZ ULTIMATE EDITION
// ======================================================

// --- ESTADO GLOBAL ---
let meuId = localStorage.getItem('kmz_id');
let meuNome = localStorage.getItem('kmz_name') || "Usuário KMZ";
let contatos = JSON.parse(localStorage.getItem('kmz_contacts') || "[]");
let grupos = JSON.parse(localStorage.getItem('kmz_groups') || "[]");
let peer = null;
let conexoes = {};
let chatAtual = null; // { id, tipo: 'p2p' ou 'grupo' }
let modoBomba = false;

// Configuração de BD para não travar
const DB_NAME = 'KMZ_DB';
let db;

// --- INICIALIZAÇÃO ---
async function init() {
    // Splash Screen
    setTimeout(() => {
        document.getElementById('splash-screen').style.opacity = 0;
        setTimeout(() => document.getElementById('splash-screen').style.display = 'none', 500);
    }, 2000);

    if (!meuId) {
        meuId = "KMZ-" + Math.floor(Math.random() * 9999999);
        localStorage.setItem('kmz_id', meuId);
    }

    document.getElementById('my-id-display').innerText = meuId;
    document.getElementById('my-nickname').value = meuNome;

    await initDB();
    renderizarListas();
    iniciarPeer();

    // Monitora Digitação
    document.getElementById('msg-input').addEventListener('input', (e) => {
        const btn = document.getElementById('icon-action');
        btn.innerText = e.target.value.trim().length > 0 ? "send" : "mic";
    });
}

// --- BANCO DE DADOS (IndexedDB) ---
function initDB() {
    return new Promise(resolve => {
        const req = indexedDB.open(DB_NAME, 2);
        req.onupgradeneeded = e => {
            db = e.target.result;
            if(!db.objectStoreNames.contains('msgs')) {
                const s = db.createObjectStore('msgs', { keyPath: 'id', autoIncrement: true });
                s.createIndex('chatId', 'chatId', { unique: false });
            }
        };
        req.onsuccess = e => { db = e.target.result; resolve(); };
    });
}

function salvarMsgDB(msg) {
    if(!db) return;
    const tx = db.transaction(['msgs'], 'readwrite');
    tx.objectStore('msgs').add(msg);
}

function carregarHistorico(chatId) {
    document.getElementById('messages-area').innerHTML = ''; // Limpa tela
    if(!db) return;
    
    const tx = db.transaction(['msgs'], 'readonly');
    const store = tx.objectStore('msgs');
    const index = store.index('chatId');
    const req = index.getAll(chatId);
    
    req.onsuccess = () => {
        const msgs = req.result;
        // OTIMIZAÇÃO: Se tiver mais de 50 msgs, renderiza só as ultimas
        const ultimas = msgs.slice(-50); 
        ultimas.forEach(m => adicionarBalaoUI(m, m.remetente === meuId ? 'sent' : 'received'));
        rolarFim();
    };
}

// --- REDE P2P ---
function iniciarPeer() {
    peer = new Peer(meuId);
    peer.on('open', () => console.log('Online'));
    peer.on('connection', conn => {
        conectar(conn);
        showToast("Nova conexão!", "success");
    });
    peer.on('error', e => console.log(e));
}

function conectar(conn) {
    conexoes[conn.peer] = conn;
    conn.on('data', data => receberPacote(data, conn.peer));
}

// --- MENSAGENS E GRUPOS ---
function acaoPrincipal() {
    const input = document.getElementById('msg-input');
    const txt = input.value.trim();
    if(txt) {
        enviarMensagem(txt, 'text');
        input.value = '';
        document.getElementById('icon-action').innerText = "mic";
    } else {
        alert("Segure para gravar áudio (Em breve)");
    }
}

function enviarMensagem(conteudo, tipo) {
    if(!chatAtual) return;

    const msg = {
        chatId: chatAtual.id,
        remetente: meuId,
        nomeRemetente: meuNome,
        tipo: tipo,
        conteudo: conteudo,
        data: new Date().getTime(),
        bomba: modoBomba
    };

    // 1. Mostra na minha tela e salva
    adicionarBalaoUI(msg, 'sent');
    salvarMsgDB(msg);

    // 2. Envia
    if (chatAtual.tipo === 'p2p') {
        // Envio Direto
        enviarP2P(chatAtual.id, msg);
    } else {
        // Envio GRUPO (Multicast)
        const grupo = grupos.find(g => g.id === chatAtual.id);
        if(grupo) {
            grupo.membros.forEach(membroId => {
                if(membroId !== meuId) enviarP2P(membroId, msg);
            });
        }
    }
    rolarFim();
}

function enviarP2P(destId, msg) {
    const conn = conexoes[destId];
    if (conn && conn.open) {
        conn.send(msg);
    } else {
        // Tenta reconectar
        const novaConn = peer.connect(destId);
        novaConn.on('open', () => {
            conexoes[destId] = novaConn;
            novaConn.send(msg);
        });
    }
}

function receberPacote(msg, senderId) {
    // Salva no DB
    salvarMsgDB(msg);

    // Se estiver no chat aberto, mostra
    if (chatAtual && chatAtual.id === msg.chatId) {
        adicionarBalaoUI(msg, 'received');
        rolarFim();
    } else {
        showToast(`Mensagem de ${msg.nomeRemetente}`, "success");
    }
}

// --- INTERFACE ---
function adicionarBalaoUI(msg, lado) {
    const area = document.getElementById('messages-area');
    const div = document.createElement('div');
    div.className = `msg ${lado}`;
    
    let conteudoHtml = msg.conteudo;
    
    // Tratamento de Imagem
    if(msg.tipo === 'image') {
        conteudoHtml = `<img src="${msg.conteudo}" onclick="abrirImagem(this.src)">`;
    }

    // Bomba
    if(msg.bomba) {
        setTimeout(() => { div.innerHTML = "<i>Mensagem apagada</i>"; div.style.opacity = 0.5; }, 10000);
        conteudoHtml += " <small>⏱ 10s</small>";
    }

    // Nome no Grupo
    let header = "";
    if(lado === 'received' && chatAtual.tipo === 'group') {
        header = `<div style="font-size:0.8rem;color:orange;margin-bottom:2px">${msg.nomeRemetente}</div>`;
    }

    const hora = new Date(msg.data).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    div.innerHTML = `${header}${conteudoHtml}<span class="msg-time">${hora}</span>`;
    
    area.appendChild(div);
}

// --- GRUPOS (Lógica KMZ) ---
function criarGrupo() {
    const nome = document.getElementById('new-group-name').value;
    // Pega membros selecionados
    const checkboxes = document.querySelectorAll('.member-check:checked');
    const membros = Array.from(checkboxes).map(cb => cb.value);
    
    if(!nome || membros.length === 0) return alert("Defina nome e membros");
    
    membros.push(meuId); // Eu sou membro
    
    const novoGrupo = {
        id: "Group-" + Math.floor(Math.random() * 1000000),
        name: nome,
        membros: membros,
        admin: meuId
    };
    
    grupos.push(novoGrupo);
    localStorage.setItem('kmz_groups', JSON.stringify(grupos));
    
    // Avisa os membros que o grupo foi criado (Protocolo simples)
    membros.forEach(m => {
        if(m !== meuId) {
            enviarP2P(m, {
                tipo: 'system_group_create',
                grupo: novoGrupo
            });
        }
    });
    
    renderizarListas();
    document.getElementById('modal-group').classList.remove('open');
}

// --- LIGHTBOX (Imagem Cheia) ---
function abrirImagem(src) {
    const viewer = document.getElementById('image-viewer');
    const img = document.getElementById('img-full');
    img.src = src;
    viewer.classList.add('active');
}
function fecharImagem() {
    document.getElementById('image-viewer').classList.remove('active');
}

// --- ARQUIVOS ---
const GerenciadorArquivos = {
    selecionar: function(input) {
        const file = input.files[0];
        if(!file) return;
        
        // Se for imagem, converte pra base64 e exibe
        if(file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = e => enviarMensagem(e.target.result, 'image');
            reader.readAsDataURL(file);
        } else {
            enviarMensagem(`Arquivo: ${file.name}`, 'text');
        }
        input.value = '';
    }
}

// --- UTILITÁRIOS ---
function renderizarListas() {
    const listChats = document.getElementById('list-chats');
    const listGroups = document.getElementById('list-groups');
    const containerGroups = document.getElementById('groups-container');
    
    listChats.innerHTML = '';
    containerGroups.innerHTML = '';

    // Renderiza Contatos
    contatos.forEach(c => {
        const d = document.createElement('div');
        d.className = 'contact-item';
        d.onclick = () => abrirChat(c.id, c.name, 'p2p');
        d.innerHTML = `<div class="item-avatar">${c.name[0]}</div><div class="item-info"><h4>${c.name}</h4><p>Toque para conversar</p></div>`;
        listChats.appendChild(d);
    });

    // Renderiza Grupos
    grupos.forEach(g => {
        const d = document.createElement('div');
        d.className = 'contact-item';
        d.onclick = () => abrirChat(g.id, g.name, 'group');
        d.innerHTML = `<div class="item-avatar" style="background:orange"><i class="material-icons">group</i></div><div class="item-info"><h4>${g.name}</h4><p>${g.membros.length} membros</p></div>`;
        containerGroups.appendChild(d);
    });
}

function abrirChat(id, nome, tipo) {
    chatAtual = { id, name: nome, tipo };
    document.getElementById('current-chat-name').innerText = nome;
    document.getElementById('current-chat-status').innerText = tipo === 'group' ? 'Grupo KMZ' : 'Online';
    carregarHistorico(id);
    trocarTela('view-chat');
}

function mostrarModalGrupo() {
    const container = document.getElementById('group-members-selection');
    container.innerHTML = '';
    contatos.forEach(c => {
        container.innerHTML += `<div class="checkbox-item"><input type="checkbox" class="member-check" value="${c.id}"> ${c.name}</div>`;
    });
    document.getElementById('modal-group').classList.add('open');
}

// Navegação
function mudarAba(aba) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.list-container').forEach(l => l.style.display = 'none');
    
    if(aba === 'chats') {
        document.querySelector('.tab:nth-child(1)').classList.add('active');
        document.getElementById('list-chats').style.display = 'block';
    } else {
        document.querySelector('.tab:nth-child(2)').classList.add('active');
        document.getElementById('list-groups').style.display = 'block';
    }
}

function salvarNovoContato() {
    const n = document.getElementById('new-contact-name').value;
    const i = document.getElementById('new-contact-id').value;
    contatos.push({name:n, id:i});
    localStorage.setItem('kmz_contacts', JSON.stringify(contatos));
    renderizarListas();
    fecharModalAdd();
}

// Helpers Básicos
function trocarTela(id) { document.querySelectorAll('.view').forEach(v => v.classList.remove('active')); document.getElementById(id).classList.add('active'); }
function voltarHome() { chatAtual = null; trocarTela('view-home'); }
function mostrarModalAdd() { document.getElementById('modal-add').classList.add('open'); }
function fecharModalAdd() { document.getElementById('modal-add').classList.remove('open'); }
function showToast(msg) { const t = document.createElement('div'); t.className='toast'; t.innerText=msg; document.getElementById('toast-container').appendChild(t); setTimeout(()=>t.remove(), 3000); }
function toggleModoBomba() { modoBomba = !modoBomba; document.getElementById('btn-bomb').style.color = modoBomba ? 'red' : 'inherit'; showToast(modoBomba ? "Modo Espião Ativado" : "Modo Normal"); }
function rolarFim() { const area = document.getElementById('messages-area'); area.scrollTop = area.scrollHeight; }

init();
