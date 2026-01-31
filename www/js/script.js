// --- CONFIGURAÇÃO INICIAL ---

// Gera um ID aleatório simples (ex: User-4821)
// Em produção, isso seria uma chave pública complexa
const myId = "Ghost-" + Math.floor(Math.random() * 9999);
let conn = null;

// Inicializa o PeerJS (Servidor de sinalização público gratuito)
const peer = new Peer(myId);

// Elementos da DOM
const statusDot = document.getElementById('connection-status');
const idDisplay = document.getElementById('my-id-display');
const chatBox = document.getElementById('chat-box');
const sendBtn = document.getElementById('send-btn');
const msgInput = document.getElementById('msg-input');
const destInput = document.getElementById('dest-id');

// --- EVENTOS DO PEER (REDE) ---

// 1. Quando eu me conecto à rede
peer.on('open', (id) => {
    console.log('Meu ID P2P:', id);
    idDisplay.innerText = "Meu ID: " + id;
    statusDot.style.backgroundColor = "#00ff88"; // Verde Neon (Online)
    statusDot.style.boxShadow = "0 0 8px #00ff88";
    adicionarMsgSistema("Você está online. Compartilhe seu ID.");
});

// 2. Quando ALGUÉM se conecta a mim
peer.on('connection', (connection) => {
    conn = connection;
    configurarConexao();
    adicionarMsgSistema("Alguém se conectou a você!");
    // Preenche automaticamente o ID de quem chamou no campo
    destInput.value = conn.peer;
});

// 3. Tratamento de Erros
peer.on('error', (err) => {
    console.error(err);
    adicionarMsgSistema("Erro de conexão: " + err.type);
    statusDot.style.backgroundColor = "#ff3e3e"; // Vermelho
});

// --- FUNÇÕES DE MENSAGEM ---

// Função para iniciar conexão ativa (Eu chamo o amigo)
function conectarAoAmigo() {
    const amigoId = destInput.value.trim();
    if (!amigoId) return alert("Digite o ID do amigo!");
    
    // Conecta
    conn = peer.connect(amigoId);
    configurarConexao();
}

// Configura os ouvintes da conexão (para receber dados)
function configurarConexao() {
    if(!conn) return;

    conn.on('open', () => {
        adicionarMsgSistema("Conexão segura estabelecida.");
    });

    conn.on('data', (data) => {
        // AQUI ENTRA A DESCRIPTOGRAFIA (Se implementada)
        mostrarMensagem(data, 'received');
    });
}

// Função de Enviar
function enviarMensagem() {
    const texto = msgInput.value.trim();
    const amigoId = destInput.value.trim();

    if (!texto) return;

    // Se não tem conexão ativa mas tem ID, tenta conectar
    if (!conn && amigoId) {
        conectarAoAmigo();
        // Pequeno delay para dar tempo de conectar
        setTimeout(() => enviarEfetivo(texto), 1000);
    } else if (conn) {
        enviarEfetivo(texto);
    } else {
        alert("Preencha o ID do destinatário!");
    }
}

function enviarEfetivo(texto) {
    if (conn && conn.open) {
        conn.send(texto); // Envia para o outro peer
        mostrarMensagem(texto, 'sent'); // Mostra na minha tela
        msgInput.value = ''; // Limpa o campo
        chatBox.scrollTop = chatBox.scrollHeight; // Rola para baixo
    } else {
        adicionarMsgSistema("Erro: Não conectado.");
    }
}

// --- FUNÇÕES VISUAIS ---

function mostrarMensagem(msg, tipo) {
    const div = document.createElement('div');
    div.className = 'msg ' + tipo;
    div.innerText = msg;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function adicionarMsgSistema(msg) {
    const div = document.createElement('div');
    div.className = 'system-msg';
    div.innerText = msg;
    chatBox.appendChild(div);
}

// Função extra: Clique no ID para copiar
function copiarID() {
    navigator.clipboard.writeText(myId).then(() => {
        alert("ID copiado: " + myId);
    });
}

// --- GATILHOS DE BOTÃO ---

sendBtn.addEventListener('click', enviarMensagem);

// Enviar com Enter
msgInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') enviarMensagem();
});
