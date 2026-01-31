// --- DADOS E VARIÁVEIS ---
let meuId = localStorage.getItem('ghost_my_id');
let meuNick = localStorage.getItem('ghost_my_nick') || "Eu";
let contatos = JSON.parse(localStorage.getItem('ghost_contacts') || "[]");
let contatoAtual = null; // ID de quem estou conversando agora
let peer = null;
let conexoes = {}; // Guarda as conexões ativas

// --- INICIALIZAÇÃO ---

// 1. Gera ID fixo se não existir
if (!meuId) {
    meuId = "Ghost-" + Math.floor(Math.random() * 999999);
    localStorage.setItem('ghost_my_id', meuId);
}

// 2. Aplica Tema Salvo
const temaSalvo = localStorage.getItem('ghost_theme');
if (temaSalvo) document.body.className = temaSalvo;

// 3. Inicia P2P
iniciarPeer();
renderizarContatos();
document.getElementById('my-nickname').value = meuNick;
document.getElementById('my-id-display').innerText = meuId;

// --- FUNÇÕES DE NAVEGAÇÃO ---

function irParaChat(contactId, contactName) {
    contatoAtual = { id: contactId, name: contactName };
    document.getElementById('current-chat-name').innerText = contactName;
    document.getElementById('current-chat-id').innerText = contactId;
    
    // Tenta conectar se não estiver conectado
    if (!conexoes[contactId]) {
        conectarP2P(contactId);
    }

    trocarTela('view-chat');
    document.getElementById('messages-area').innerHTML = '<div class="msg received" style="background:transparent; text-align:center; opacity:0.5; width:100%">Início da conversa criptografada</div>';
}

function voltarHome() {
    contatoAtual = null;
    trocarTela('view-home');
}

function abrirConfig() {
    trocarTela('view-settings');
}

function trocarTela(telaId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(telaId).classList.add('active');
}

// --- LÓGICA DE CONTATOS ---

function renderizarContatos() {
    const lista = document.getElementById('contact-list');
    lista.innerHTML = '';

    if (contatos.length === 0) {
        lista.innerHTML = '<div class="empty-state" style="text-align:center; padding:20px; opacity:0.6">Nenhum contato salvo.<br>Toque no +</div>';
        return;
    }

    contatos.forEach(c => {
        const item = document.createElement('div');
        item.className = 'contact-item';
        item.onclick = () => irParaChat(c.id, c.name);
        
        // Avatar com inicial
        const inicial = c.name.charAt(0).toUpperCase();
        
        item.innerHTML = `
            <div class="avatar">${inicial}</div>
            <div class="contact-info">
                <strong>${c.name}</strong>
                <small>${c.id}</small>
            </div>
        `;
        lista.appendChild(item);
    });
}

function salvarNovoContato() {
    const nome = document.getElementById('new-contact-name').value;
    const id = document.getElementById('new-contact-id').value;

    if (nome && id) {
        contatos.push({ name: nome, id: id });
        localStorage.setItem('ghost_contacts', JSON.stringify(contatos));
        renderizarContatos();
        fecharModalAdd();
        // Limpa inputs
        document.getElementById('new-contact-name').value = '';
        document.getElementById('new-contact-id').value = '';
    } else {
        alert("Preencha nome e ID!");
    }
}

// --- REDE P2P (PEERJS) ---

function iniciarPeer() {
    peer = new Peer(meuId);

    peer.on('open', (id) => {
        console.log("Conectado na rede global como: " + id);
    });

    peer.on('connection', (conn) => {
        setupConexao(conn);
        alert("Nova conexão recebida!");
    });

    peer.on('error', (err) => {
        if(err.type === 'peer-unavailable') {
           // Ignora erro se usuário estiver offline, mensagem será tentada dps
        }
        console.error(err);
    });
}

function conectarP2P(destId) {
    const conn = peer.connect(destId);
    setupConexao(conn);
}

function setupConexao(conn) {
    conexoes[conn.peer] = conn;

    conn.on('data', (data) => {
        // Se a mensagem for de quem estou conversando agora, mostra na tela
        if (contatoAtual && contatoAtual.id === conn.peer) {
            adicionarBalao(data, 'received');
        } else {
            // Se não, poderia mostrar notificação (feature futura)
            alert("Msg de " + conn.peer);
        }
    });
    
    // Atualiza status se estiver no chat
    if(contatoAtual && contatoAtual.id === conn.peer) {
        document.getElementById('current-chat-id').innerText = "Conectado";
    }
}

// --- MENSAGENS ---

function enviarMensagem() {
    const input = document.getElementById('msg-input');
    const texto = input.value.trim();
    
    if (!texto || !contatoAtual) return;

    const conn = conexoes[contatoAtual.id];
    
    if (conn && conn.open) {
        conn.send(texto);
        adicionarBalao(texto, 'sent');
        input.value = '';
    } else {
        // Tenta reconectar e enviar
        conectarP2P(contatoAtual.id);
        setTimeout(() => {
             // Tenta de novo após 1s
             const novaConn = conexoes[contatoAtual.id];
             if(novaConn && novaConn.open) {
                 novaConn.send(texto);
                 adicionarBalao(texto, 'sent');
                 input.value = '';
             } else {
                 alert("Usuário offline ou ID incorreto.");
             }
        }, 1500);
    }
}

function adicionarBalao(texto, tipo) {
    const area = document.getElementById('messages-area');
    const div = document.createElement('div');
    div.className = 'msg ' + tipo;
    div.innerText = texto;
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
}

// --- SETTINGS E UTILITÁRIOS ---

function salvarNickname() {
    const novoNick = document.getElementById('my-nickname').value;
    if(novoNick) {
        localStorage.setItem('ghost_my_nick', novoNick);
        meuNick = novoNick;
        alert("Nome salvo!");
    }
}

function mudarTema(nomeTema) {
    document.body.className = ''; // Reseta
    if (nomeTema === 'zap') document.body.classList.add('theme-zap');
    if (nomeTema === 'matrix') document.body.classList.add('theme-matrix');
    localStorage.setItem('ghost_theme', document.body.className);
}

function copiarID() {
    navigator.clipboard.writeText(meuId);
    alert("ID Copiado para área de transferência!");
}

// Modais
function mostrarModalAdd() { document.getElementById('modal-add').classList.add('open'); }
function fecharModalAdd() { document.getElementById('modal-add').classList.remove('open'); }
