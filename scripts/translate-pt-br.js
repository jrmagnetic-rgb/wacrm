const fs = require('fs');

const file = 'messages/pt-BR.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const replacements = {
  'Adicionar document': 'Adicionar documento',
  'Aberto Negócios Value': 'Valor de negócios em aberto',
  'new today vs yesterday': 'novos hoje vs. ontem',
  'vs yesterday': 'vs. ontem',
  'Enter your password': 'Digite sua senha',
  'Manage your contact list': 'Gerencie sua lista de contatos',
  'Custom fields': 'Campos personalizados',
  'Loading contacts': 'Carregando contatos',
  'No contacts match': 'Nenhum contato encontrado',
  'Add your first contact': 'Adicione seu primeiro contato',
  'Manage Funis': 'Gerencie seus funis',
  'Criar a pipeline': 'Criar um funil',
  'Deal title': 'Título do negócio',
  'Selecionar a contact': 'Selecionar um contato',
  'Send bulk messages': 'Enviar mensagens em massa',
  'Create your first broadcast': 'Crie sua primeira transmissão',
  'Build workflows...': 'Crie fluxos de trabalho...',
  'Quick-start templates': 'Modelos de início rápido',
  'Nãovo flow': 'Novo fluxo',
  'New flow': 'Novo fluxo',
  "Couldn't load flows": 'Não foi possível carregar os fluxos',
  'Create your first flow': 'Crie seu primeiro fluxo',
  'Start from a template': 'Começar com um modelo',
  'Add document': 'Adicionar documento',
  'Add Document': 'Adicionar documento'
};

let changed = 0;

function walk(value) {
  if (Array.isArray(value)) {
    return value.map(walk);
  }

  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      value[key] = walk(value[key]);
    }
    return value;
  }

  if (typeof value === 'string' && replacements[value]) {
    changed++;
    return replacements[value];
  }

  return value;
}

walk(data);

fs.writeFileSync(
  file,
  JSON.stringify(data, null, 2) + '\n',
  'utf8'
);

console.log(`Traduções corrigidas: ${changed}`);
console.log(`Arquivo atualizado: ${file}`);
