/* Regras da Lei 14.133/2021: taxonomia, matriz de documentos exigíveis e motor de crítica.
   Config declarativa e funções puras — sem DOM e sem Supabase, para poder evoluir sozinho.
   Nenhuma saída daqui substitui a leitura do edital original. */
(function(global){
'use strict';

const modalidades=[
  {v:'pregao',n:'Pregão',uso:'Bens e serviços comuns, inclusive comuns de engenharia'},
  {v:'concorrencia',n:'Concorrência',uso:'Bens/serviços não comuns, obras e serviços especiais de engenharia'},
  {v:'concurso',n:'Concurso',uso:'Trabalho técnico, científico ou artístico'},
  {v:'leilao',n:'Leilão',uso:'Venda ou alienação de bens'},
  {v:'dialogo_competitivo',n:'Diálogo competitivo',uso:'Alta complexidade ou inovação'}
];
const formasDiretas=[
  {v:'dispensa',n:'Dispensa de licitação',uso:'Art. 75, incisos I a XVI'},
  {v:'inexigibilidade',n:'Inexigibilidade de licitação',uso:'Art. 74, incisos I a V — inviabilidade de competição'}
];
const tiposObjeto=[
  {v:'bens_comuns',n:'Compras de bens comuns'},
  {v:'servicos_comuns',n:'Serviços comuns (não engenharia)'},
  {v:'servicos_comuns_engenharia',n:'Serviços comuns de engenharia'},
  {v:'obras',n:'Obras'},
  {v:'servicos_especiais_engenharia',n:'Serviços especiais de engenharia'},
  {v:'servicos_especiais_intelectuais',n:'Serviços técnicos especializados (intelectuais)'},
  {v:'locacao_imoveis',n:'Locação de imóveis'},
  {v:'alienacao_bens',n:'Alienação de bens'}
];
const criterios=[
  {v:'menor_preco',n:'Menor preço'},
  {v:'maior_desconto',n:'Maior desconto'},
  {v:'tecnica_e_preco',n:'Técnica e preço'},
  {v:'melhor_tecnica_conteudo_artistico',n:'Melhor técnica ou conteúdo artístico'},
  {v:'maior_lance',n:'Maior lance'},
  {v:'maior_retorno_economico',n:'Maior retorno econômico'}
];
const modosDisputa=[
  {v:'aberto',n:'Aberto'},{v:'fechado',n:'Fechado'},
  {v:'aberto_fechado',n:'Aberto e fechado'},{v:'fechado_aberto',n:'Fechado e aberto'}
];
const regimesExecucao=[
  {v:'empreitada_preco_unitario',n:'Empreitada por preço unitário'},
  {v:'empreitada_preco_global',n:'Empreitada por preço global'},
  {v:'empreitada_integral',n:'Empreitada integral'},
  {v:'contratacao_tarefa',n:'Contratação por tarefa'},
  {v:'contratacao_integrada',n:'Contratação integrada'},
  {v:'contratacao_semi_integrada',n:'Contratação semi-integrada'},
  {v:'fornecimento_prestacao_associado',n:'Fornecimento e prestação de serviço associado'}
];
const procedimentosAuxiliares=[
  {v:'',n:'Nenhum'},
  {v:'sistema_registro_precos',n:'Sistema de registro de preços (SRP)'},
  {v:'credenciamento',n:'Credenciamento'},
  {v:'pre_qualificacao',n:'Pré-qualificação'},
  {v:'procedimento_manifestacao_interesse',n:'Procedimento de manifestação de interesse'}
];
const meEpp=[
  {v:'nao',n:'Sem tratamento diferenciado'},
  {v:'cota',n:'Cota reservada a ME/EPP'},
  {v:'sim',n:'Exclusivo para ME/EPP'}
];
const blocos={
  juridica:{n:'Habilitação jurídica',base:'Art. 66',pasta:'01-habilitacao-juridica'},
  fiscal_trabalhista:{n:'Regularidade fiscal, social e trabalhista',base:'Art. 68',pasta:'02-habilitacao-fiscal-trabalhista'},
  economico_financeira:{n:'Qualificação econômico-financeira',base:'Art. 69',pasta:'03-qualificacao-economico-financeira'},
  tecnica:{n:'Qualificação técnica',base:'Art. 67',pasta:'04-qualificacao-tecnica'},
  proposta:{n:'Proposta',base:'Art. 63 e edital',pasta:'05-proposta'},
  declaracoes:{n:'Declarações',base:'Lei 14.133/2021 e LC 123/2006',pasta:'06-declaracoes'},
  processo_contratacao_direta:{n:'Processo de contratação direta',base:'Arts. 72, 74 e 75',pasta:'07-processo-contratacao-direta'}
};

/* ---------------------------------------------------------------------------
   Catálogo de tipos documentais do acervo.

   É o critério de arquivamento: em vez de `tipo` em texto livre, cada documento
   passa a apontar para uma destas chaves. Cada tipo declara como a vigência
   funciona, porque isso é o que decide qual arquivo vale hoje:

     validade     — vale até a data de validade (certidões, licenças, registros)
     substituivel — o mais recente substitui os anteriores (contrato social, CNPJ)
     acumulativo  — todos continuam valendo juntos (atestados, ART)

   `base:true` marca o que praticamente todo edital exige — é a régua do veredito
   de prontidão. `atende` lista as chaves da matriz que o tipo satisfaz, para o
   assistente casar por chave em vez de adivinhar por texto.
--------------------------------------------------------------------------- */
const catalogoDocumentos=[
  {chave:'ato_constitutivo',nome:'Contrato social ou ato constitutivo',bloco:'juridica',vigencia:'substituivel',base:true,atende:['ato_constitutivo'],
   detecta:/contrato social|ato constitutivo|estatuto social|requerimento de empres|certificado.*mei/i},
  {chave:'alteracao_contratual',nome:'Alteração contratual',bloco:'juridica',vigencia:'acumulativo',atende:['ato_constitutivo'],
   detecta:/altera[cç][aã]o contratual|consolida[cç][aã]o contratual/i},
  {chave:'cnpj',nome:'Comprovante de inscrição no CNPJ',bloco:'juridica',vigencia:'substituivel',base:true,atende:['cnpj'],
   detecta:/cart[aã]o cnpj|comprovante.*inscri[cç][aã]o.*cnpj|\bcnpj\b/i},
  {chave:'doc_representante',nome:'Documento do representante legal',bloco:'juridica',vigencia:'acumulativo',base:true,atende:['doc_representante'],
   detecta:/\brg\b|\bcpf\b|\bcnh\b|identidade|documento.*representante/i},
  {chave:'procuracao',nome:'Procuração ou credenciamento',bloco:'juridica',vigencia:'validade',atende:['doc_representante'],
   detecta:/procura[cç][aã]o|credenciamento/i},

  {chave:'cnd_federal',nome:'Certidão conjunta Federal/PGFN',bloco:'fiscal_trabalhista',vigencia:'validade',base:true,certidao:'Federal/PGFN',atende:['cnd_federal']},
  {chave:'crf_fgts',nome:'Certificado de Regularidade do FGTS',bloco:'fiscal_trabalhista',vigencia:'validade',base:true,certidao:'FGTS',atende:['crf_fgts']},
  {chave:'cndt',nome:'Certidão Negativa de Débitos Trabalhistas',bloco:'fiscal_trabalhista',vigencia:'validade',base:true,certidao:'CNDT',atende:['cndt']},
  {chave:'cnd_estadual',nome:'Regularidade com a Fazenda Estadual',bloco:'fiscal_trabalhista',vigencia:'validade',base:true,certidao:'Estadual',atende:['cnd_estadual']},
  {chave:'cnd_municipal',nome:'Regularidade com a Fazenda Municipal',bloco:'fiscal_trabalhista',vigencia:'validade',base:true,certidao:'Municipal',atende:['cnd_municipal']},
  {chave:'sicaf',nome:'Registro no SICAF',bloco:'fiscal_trabalhista',vigencia:'validade',certidao:'SICAF',atende:[]},

  {chave:'balanco',nome:'Balanço patrimonial e demonstrações contábeis',bloco:'economico_financeira',vigencia:'substituivel',atende:['balanco'],
   detecta:/balan[cç]o|balancete|demonstra[cç][aã]o.*cont[aá]bil|\bdre\b|\becd\b|sped.*cont[aá]bil/i},
  {chave:'cnd_falencia',nome:'Certidão de falência e recuperação judicial',bloco:'economico_financeira',vigencia:'validade',certidao:'Falência e recuperação',atende:['cnd_falencia']},
  {chave:'certidao_junta',nome:'Certidão simplificada da Junta Comercial',bloco:'economico_financeira',vigencia:'validade',certidao:'Certidão simplificada da Junta Comercial',atende:[]},

  {chave:'registro_crea',nome:'Registro da empresa no conselho profissional (pessoa jurídica)',bloco:'tecnica',vigencia:'substituivel',atende:['registro_crea'],
   detecta:/(crea|cau|crc).{0,15}(pessoa jur[ií]dica|\bpj\b|empresa)|(pessoa jur[ií]dica|\bpj\b).{0,15}(crea|cau|crc)|\bcrpj\b/i},
  {chave:'registro_conselho',nome:'Registro do responsável técnico no conselho profissional (pessoa física)',bloco:'tecnica',vigencia:'acumulativo',atende:['registro_conselho'],
   detecta:/(crea|cau|crc).{0,15}(pessoa f[ií]sica|\bpf\b|profissional|respons[aá]vel)|(pessoa f[ií]sica|\bpf\b).{0,15}(crea|cau|crc)|\bcrppf\b/i},
  {chave:'atestado_capacidade',nome:'Atestado de capacidade técnica',bloco:'tecnica',vigencia:'acumulativo',
   atende:['atestado_capacidade','atestado_operacional','atestado_profissional','atestado_similar','curriculo_equipe','notoria_especializacao','certificacao_produto','exclusividade'],
   detecta:/atestado.*capacidade|capacidade t[eé]cnica|acervo t[eé]cnico|\bcat\b/i},
  {chave:'art_rrt',nome:'ART ou RRT',bloco:'tecnica',vigencia:'acumulativo',atende:['art_rrt','art_atestado'],
   detecta:/\bart\b|\brrt\b|anota[cç][aã]o de responsabilidade/i},
  {chave:'vinculo_rt',nome:'Vínculo do responsável técnico',bloco:'tecnica',vigencia:'substituivel',atende:['vinculo_rt'],
   detecta:/v[ií]nculo.*respons[aá]vel|contrato de trabalho|\bctps\b/i},
  {chave:'licenca_alvara',nome:'Licença ou alvará de funcionamento',bloco:'tecnica',vigencia:'validade',atende:[],
   detecta:/alvar[aá]|licen[cç]a sanit[aá]ria|vigil[aâ]ncia sanit[aá]ria|licen[cç]a.*funcionamento|licen[cç]a ambiental/i},

  {chave:'declaracao',nome:'Declaração',bloco:'declaracoes',vigencia:'acumulativo',atende:['decl_me_epp'],
   detecta:/declara[cç][aã]o/i},
  {chave:'proposta_modelo',nome:'Proposta ou composição de preços',bloco:'proposta',vigencia:'acumulativo',atende:[],
   detecta:/proposta|mem[oó]ria de c[aá]lculo|composi[cç][aã]o de custos|planilha.*pre[cç]o/i},
  {chave:'processo',nome:'Edital ou documento de processo',bloco:'processo_contratacao_direta',vigencia:'acumulativo',atende:[],
   detecta:/edital|preg[aã]o|concorr[eê]ncia|termo de refer[eê]ncia|recurso|contrarraz[oõ]es|impugna[cç][aã]o/i},
  {chave:'dados_bancarios',nome:'Dados bancários',bloco:'juridica',vigencia:'substituivel',atende:[],
   detecta:/dados banc[aá]rios|conta banc[aá]ria|comprovante.*banco/i},
  {chave:'outros',nome:'Documento não classificado',bloco:'juridica',vigencia:'acumulativo',atende:[]}
];
const tipoDocumento=chave=>catalogoDocumentos.find(t=>t.chave===chave)||catalogoDocumentos[catalogoDocumentos.length-1];
/* Tipos que o assistente aceita para uma dada exigência da matriz. */
const tiposQueAtendem=chaveMatriz=>catalogoDocumentos.filter(t=>t.atende?.includes(chaveMatriz));
const tiposBase=()=>catalogoDocumentos.filter(t=>t.base);

/* Classifica um documento já arquivado no catálogo, a partir do que existir:
   a certidão tipada, a categoria antiga e o texto do tipo/nome do arquivo. */
function classificarNoCatalogo({categoria,tipo,nome}={}){
  // Nome de arquivo separa palavra com hífen, sublinhado e ponto: vira espaço,
  // senão "alteracao-contratual.pdf" não casa com "alteração contratual".
  const texto=`${tipo||''} ${nome||''}`.replace(/[-_.]+/g,' ');
  const porCertidao=catalogoDocumentos.find(t=>t.certidao&&t.certidao===tipo);
  if(porCertidao)return porCertidao.chave;
  if(categoria==='Certidões'){
    const certidao=catalogoDocumentos.find(t=>t.certidao&&new RegExp(t.certidao.split('/')[0],'i').test(texto));
    if(certidao)return certidao.chave;
  }
  if(categoria==='Balanços')return'balanco';
  const porTexto=catalogoDocumentos.find(t=>t.detecta&&t.detecta.test(texto));
  if(porTexto)return porTexto.chave;
  return({'Societários':'ato_constitutivo','Atestados técnicos':'atestado_capacidade','Licenças e alvarás':'licenca_alvara',
    'Representação':'procuracao','Declarações':'declaracao','Propostas':'proposta_modelo','Editais e processos':'processo',
    'Identificação':'doc_representante','Dados bancários':'dados_bancarios'})[categoria]||'outros';
}

/* Valores do Decreto nº 12.807/2025 (vigência 2026). Ficam aqui só como reserva:
   a fonte de verdade é a tabela public.parametros_legais, carregada pelo app. */
const parametrosPadrao={
  dispensa_art75_I:130984.20,
  dispensa_art75_II:65492.11,
  dispensa_art75_p7:10478.74,
  contrato_verbal_art95:13098.41,
  inexigibilidade_servicos_tecnicos:392952.63
};
let parametros={...parametrosPadrao};
const definirParametros=valores=>{parametros={...parametrosPadrao,...(valores||{})}};
const parametro=chave=>parametros[chave];

const rotulo=(lista,valor)=>lista.find(x=>x.v===valor)?.n||'';
const engenharia=t=>['obras','servicos_comuns_engenharia','servicos_especiais_engenharia'].includes(t);
const objetoDeMaiorVulto=t=>['obras','servicos_especiais_engenharia','servicos_especiais_intelectuais'].includes(t);
const numero=v=>{const n=typeof v==='number'?v:parseFloat(String(v??'').replace(/\./g,'').replace(',','.'));return Number.isFinite(n)?n:0};

/* Exigibilidade dos blocos que a lei trata como facultativos.
   Limiar de valor pensado como triagem, não como regra fechada: quem manda é o edital. */
const LIMIAR_ECONOMICO=250000;
function exigeEconomicoFinanceiro(p){
  if(p.temCertame===false)return false;
  if(p.modalidade==='concurso'||p.modalidade==='leilao')return false;
  return objetoDeMaiorVulto(p.tipoObjeto)||p.modalidade==='concorrencia'||p.modalidade==='dialogo_competitivo'||numero(p.valorEstimado)>=LIMIAR_ECONOMICO;
}
function exigeTecnica(p){
  if(p.tipoObjeto==='bens_comuns')return numero(p.valorEstimado)>=LIMIAR_ECONOMICO;
  return true;
}

/* ---------------------------------------------------------------------------
   Vigência do acervo: qual arquivo vale hoje, por tipo.

   Recebe os documentos já normalizados ({chave, data, validade, ...}) e devolve
   uma entrada por tipo com o vigente separado das versões anteriores. É o que
   permite responder "qual é o contrato social atual?" sem abrir dez arquivos.
--------------------------------------------------------------------------- */
const DIAS_VENCE_LOGO=30;
function situacaoDoDocumento(doc,hoje){
  if(!doc.validade)return'sem_validade';
  if(doc.validade<hoje)return'vencido';
  return diasEntre(hoje,doc.validade)<=DIAS_VENCE_LOGO?'vence_logo':'vigente';
}
function acervoVigente(documentos,dataAlvo){
  const hoje=dataAlvo||hojeIso();
  const porTipo=new Map();
  (documentos||[]).forEach(d=>{
    const chave=d.chave||'outros';
    if(!porTipo.has(chave))porTipo.set(chave,[]);
    porTipo.get(chave).push({...d,situacao:situacaoDoDocumento(d,hoje)});
  });
  return [...porTipo.entries()].map(([chave,lista])=>{
    const tipo=tipoDocumento(chave);
    const recente=(a,b)=>(b.data||b.validade||'').localeCompare(a.data||a.validade||'');
    let vigente=null,anteriores=[];
    if(tipo.vigencia==='validade'){
      // Vale a de maior validade que ainda não venceu; se todas venceram, a última.
      const ordenadas=[...lista].sort((a,b)=>(b.validade||'').localeCompare(a.validade||''));
      vigente=ordenadas.find(d=>d.validade&&d.validade>=hoje)||ordenadas[0]||null;
      anteriores=ordenadas.filter(d=>d!==vigente);
    }else if(tipo.vigencia==='substituivel'){
      const ordenadas=[...lista].sort(recente);
      vigente=ordenadas[0]||null;
      anteriores=ordenadas.slice(1);
    }else{
      // Acumulativo: todos valem. O mais recente representa o conjunto.
      const ordenadas=[...lista].sort(recente);
      vigente=ordenadas[0]||null;
      anteriores=ordenadas.slice(1);
    }
    return {chave,tipo,vigente,anteriores,total:lista.length,
      acumulativo:tipo.vigencia==='acumulativo',
      situacao:vigente?vigente.situacao:'ausente'};
  }).sort((a,b)=>{
    // Bloco na ordem da lei; dentro do bloco, a ordem do catálogo, que segue a
    // sequência em que os documentos costumam ser pedidos.
    const ordemBloco=Object.keys(blocos),ordemTipo=catalogoDocumentos.map(t=>t.chave);
    return ordemBloco.indexOf(a.tipo.bloco)-ordemBloco.indexOf(b.tipo.bloco)
      ||ordemTipo.indexOf(a.chave)-ordemTipo.indexOf(b.chave);
  });
}

/* ---------------------------------------------------------------------------
   Prontidão: a empresa está apta a disputar hoje?

   Olha só a base documental mínima — o que praticamente todo edital exige,
   independentemente do objeto. Não substitui o checklist do processo, que é
   calculado pelo edital concreto.
--------------------------------------------------------------------------- */
function prontidaoDaEmpresa(documentos,dataAlvo){
  const hoje=dataAlvo||hojeIso();
  const vigencias=acervoVigente(documentos,hoje);
  const porChave=new Map(vigencias.map(v=>[v.chave,v]));
  const faltando=[],vencidos=[],vencendo=[],emDia=[];
  tiposBase().forEach(tipo=>{
    const v=porChave.get(tipo.chave);
    if(!v||!v.vigente){faltando.push(tipo);return}
    if(v.situacao==='vencido')vencidos.push({tipo,doc:v.vigente});
    else if(v.situacao==='vence_logo')vencendo.push({tipo,doc:v.vigente});
    else emDia.push({tipo,doc:v.vigente});
  });
  const base=tiposBase().length;
  const bloqueios=faltando.length+vencidos.length;
  const status=bloqueios?'nao_apto':vencendo.length?'apto_com_ressalva':'apto';
  return {status,faltando,vencidos,vencendo,emDia,base,
    prontos:emDia.length+vencendo.length,
    percentual:base?Math.round((emDia.length+vencendo.length)/base*100):0};
}
const ROTULO_PRONTIDAO={apto:'Apto a disputar',apto_com_ressalva:'Apto, com documento vencendo',nao_apto:'Não apto hoje'};

/* ---------------------------------------------------------------------------
   Matriz de documentos: cruza modalidade/forma × tipo de objeto × valor.
   Cada item vira uma linha de licitacao_checklist_itens.
   `busca` é o que o motor de vinculação usa para procurar no acervo da empresa.
--------------------------------------------------------------------------- */
function calcularMatrizDocumentos(processo){
  const p={
    temCertame:processo.temCertame!==false,
    modalidade:processo.modalidade||null,
    formaDireta:processo.formaDireta||null,
    tipoObjeto:processo.tipoObjeto||'bens_comuns',
    criterio:processo.criterio||'menor_preco',
    regime:processo.regime||null,
    meEpp:processo.meEpp||'nao',
    valorEstimado:numero(processo.valorEstimado)
  };
  const itens=[];
  let ordem=0;
  const add=item=>{itens.push({...item,ordem:ordem++,obrigatorio:item.obrigatorio!==false,bloco:item.bloco});};

  // Habilitação jurídica — art. 66
  add({chave:'ato_constitutivo',bloco:'juridica',titulo:'Ato constitutivo/contrato social consolidado e alterações',baseLegal:'Art. 66, III',busca:{categoria:'Societários',tipos:[/contrato social|ato constitutivo|estatuto|requerimento de empres/i]}});
  add({chave:'cnpj',bloco:'juridica',titulo:'Comprovante de inscrição no CNPJ',baseLegal:'Art. 66',busca:{categoria:'Identificação',tipos:[/cnpj|cart[aã]o cnpj/i]}});
  add({chave:'doc_representante',bloco:'juridica',titulo:'Documento de identificação do representante legal',baseLegal:'Art. 66',busca:{categoria:'Representação',tipos:[/rg|cpf|identidade|procura[cç][aã]o/i]},obrigatorio:false});

  // Regularidade fiscal, social e trabalhista — art. 68
  add({chave:'cnd_federal',bloco:'fiscal_trabalhista',titulo:'Certidão conjunta Federal/PGFN',baseLegal:'Art. 68, II',busca:{certidao:'Federal/PGFN'}});
  add({chave:'crf_fgts',bloco:'fiscal_trabalhista',titulo:'Certificado de Regularidade do FGTS (CRF)',baseLegal:'Art. 68, IV',busca:{certidao:'FGTS'}});
  add({chave:'cndt',bloco:'fiscal_trabalhista',titulo:'Certidão Negativa de Débitos Trabalhistas (CNDT)',baseLegal:'Art. 68, V',busca:{certidao:'CNDT'}});
  add({chave:'cnd_estadual',bloco:'fiscal_trabalhista',titulo:'Regularidade com a Fazenda Estadual',baseLegal:'Art. 68, III',busca:{certidao:'Estadual'}});
  add({chave:'cnd_municipal',bloco:'fiscal_trabalhista',titulo:'Regularidade com a Fazenda Municipal',baseLegal:'Art. 68, III',busca:{certidao:'Municipal'}});

  // Qualificação econômico-financeira — art. 69
  if(exigeEconomicoFinanceiro(p)){
    add({chave:'balanco',bloco:'economico_financeira',titulo:'Balanço patrimonial e demonstrações contábeis do último exercício',baseLegal:'Art. 69, II',busca:{balanco:true}});
    add({chave:'cnd_falencia',bloco:'economico_financeira',titulo:'Certidão negativa de falência e recuperação judicial',baseLegal:'Art. 69, II',busca:{certidao:'Falência e recuperação'}});
    add({chave:'patrimonio_liquido',bloco:'economico_financeira',titulo:`Patrimônio líquido ou capital social mínimo${p.valorEstimado?` — teto legal de 10%: ${moeda(p.valorEstimado*0.1)}`:''}`,baseLegal:'Art. 69, §§ 2º e 4º',busca:null});
    add({chave:'indices_contabeis',bloco:'economico_financeira',titulo:'Índices contábeis (LG, LC e SG) conforme a fórmula do edital',baseLegal:'Art. 69, §1º',busca:null,obrigatorio:false});
    if(p.tipoObjeto==='obras'||p.tipoObjeto==='servicos_especiais_engenharia')
      add({chave:'garantia_proposta',bloco:'economico_financeira',titulo:`Garantia de proposta, se exigida pelo edital${p.valorEstimado?` — até 1%: ${moeda(p.valorEstimado*0.01)}`:''}`,baseLegal:'Art. 58',busca:null,obrigatorio:false});
  }

  // Qualificação técnica — art. 67
  if(exigeTecnica(p)){
    const t=p.tipoObjeto;
    if(t==='bens_comuns'){
      add({chave:'certificacao_produto',bloco:'tecnica',titulo:'Certificação técnica do produto (INMETRO, ANVISA ou equivalente), conforme o item',baseLegal:'Art. 67',busca:{categoria:'Atestados técnicos'},obrigatorio:false});
      add({chave:'amostra',bloco:'tecnica',titulo:'Amostra ou prova de conceito, se exigida pelo edital',baseLegal:'Art. 67, §3º',busca:null,obrigatorio:false});
    }
    if(t==='servicos_comuns'){
      add({chave:'atestado_capacidade',bloco:'tecnica',titulo:'Atestado de capacidade técnica compatível com o objeto',baseLegal:'Art. 67, II',busca:{categoria:'Atestados técnicos'}});
      add({chave:'registro_conselho',bloco:'tecnica',titulo:'Registro em conselho profissional, quando a atividade exigir',baseLegal:'Art. 67, I',busca:{categoria:'Registro profissional'},obrigatorio:false});
    }
    if(t==='servicos_comuns_engenharia'){
      add({chave:'registro_crea',bloco:'tecnica',titulo:'Registro da empresa no CREA/CAU',baseLegal:'Art. 67, I',busca:{categoria:'Registro profissional',tipos:[/crea|cau/i]}});
      add({chave:'atestado_capacidade',bloco:'tecnica',titulo:'Atestado de capacidade técnica compatível com o objeto',baseLegal:'Art. 67, II',busca:{categoria:'Atestados técnicos'}});
      add({chave:'art_atestado',bloco:'tecnica',titulo:'ART/RRT do atestado de capacidade técnica',baseLegal:'Art. 67, II',busca:{categoria:'ART/RRT'}});
    }
    if(t==='obras'||t==='servicos_especiais_engenharia'){
      add({chave:'registro_crea',bloco:'tecnica',titulo:'Registro da empresa no CREA/CAU',baseLegal:'Art. 67, I',busca:{categoria:'Registro profissional',tipos:[/crea|cau/i]}});
      add({chave:'atestado_operacional',bloco:'tecnica',titulo:'Atestado de capacidade técnico-operacional (empresa)',baseLegal:'Art. 67, II',busca:{categoria:'Atestados técnicos'}});
      add({chave:'atestado_profissional',bloco:'tecnica',titulo:'Atestado de capacidade técnico-profissional (responsável técnico)',baseLegal:'Art. 67, II',busca:{categoria:'Atestados técnicos'}});
      add({chave:'art_rrt',bloco:'tecnica',titulo:'ART/RRT dos atestados apresentados',baseLegal:'Art. 67, II',busca:{categoria:'ART/RRT'}});
      add({chave:'vinculo_rt',bloco:'tecnica',titulo:'Comprovação do vínculo do responsável técnico com a empresa',baseLegal:'Art. 67, §1º',busca:{categoria:'Societários',tipos:[/contrato de trabalho|ctps|contrato social|v[ií]nculo/i]}});
      add({chave:'vistoria',bloco:'tecnica',titulo:'Declaração de vistoria técnica ou de dispensa de vistoria',baseLegal:'Art. 63, §2º',busca:null});
      add({chave:'equipe_tecnica',bloco:'tecnica',titulo:'Relação da equipe técnica mínima exigida pelo edital',baseLegal:'Art. 67, V',busca:null,obrigatorio:false});
      if(t==='servicos_especiais_engenharia'&&['contratacao_integrada','contratacao_semi_integrada'].includes(p.regime))
        add({chave:'metodologia',bloco:'tecnica',titulo:'Metodologia executiva e plano de trabalho',baseLegal:'Art. 46, §§ 1º e 2º',busca:null});
    }
    if(t==='servicos_especiais_intelectuais'){
      add({chave:'curriculo_equipe',bloco:'tecnica',titulo:'Currículo e portfólio da equipe técnica',baseLegal:'Art. 67, IV',busca:{categoria:'Atestados técnicos'}});
      add({chave:'notoria_especializacao',bloco:'tecnica',titulo:'Comprovação de notória especialização, quando for o caso',baseLegal:'Art. 74, III, §3º',busca:{categoria:'Atestados técnicos'},obrigatorio:false});
      add({chave:'atestado_similar',bloco:'tecnica',titulo:'Atestados de serviço similar já executado',baseLegal:'Art. 67, II',busca:{categoria:'Atestados técnicos'}});
    }
    if(t==='locacao_imoveis'){
      add({chave:'matricula_imovel',bloco:'tecnica',titulo:'Matrícula atualizada do imóvel',baseLegal:'Art. 51',busca:null});
      add({chave:'habite_se',bloco:'tecnica',titulo:'Habite-se e regularidade do imóvel',baseLegal:'Art. 51',busca:null});
      add({chave:'laudo_avaliacao',bloco:'tecnica',titulo:'Laudo de vistoria e de avaliação do imóvel',baseLegal:'Art. 51',busca:null});
    }
    if(t==='alienacao_bens'){
      add({chave:'doc_arrematante',bloco:'tecnica',titulo:'Documento de identificação do arrematante',baseLegal:'Art. 31',busca:null});
      add({chave:'capacidade_pagamento',bloco:'tecnica',titulo:'Comprovação de capacidade de pagamento e garantia de lance',baseLegal:'Art. 31, §2º',busca:null});
    }
  }

  // Proposta — varia por critério de julgamento e objeto
  add({chave:'planilha_precos',bloco:'proposta',titulo:'Planilha de itens com preço unitário e total',baseLegal:'Art. 63',busca:null});
  add({chave:'validade_proposta',bloco:'proposta',titulo:'Prazo de validade da proposta',baseLegal:'Art. 90, §4º',busca:null});
  add({chave:'precos_inclusos',bloco:'proposta',titulo:'Declaração de que tributos, frete e encargos estão inclusos nos preços',baseLegal:'Art. 63, §1º',busca:null});
  if(['tecnica_e_preco','melhor_tecnica_conteudo_artistico'].includes(p.criterio))
    add({chave:'proposta_tecnica',bloco:'proposta',titulo:'Proposta técnica com metodologia, cronograma e pontuação para conferência',baseLegal:'Art. 36 e 37',busca:null});
  if(p.tipoObjeto==='obras'||p.tipoObjeto==='servicos_especiais_engenharia'){
    add({chave:'planilha_orcamentaria',bloco:'proposta',titulo:'Planilha orçamentária detalhada com BDI',baseLegal:'Art. 6º, XXIV',busca:null});
    add({chave:'cronograma',bloco:'proposta',titulo:'Cronograma físico-financeiro',baseLegal:'Art. 6º, XXV',busca:null});
    add({chave:'composicao_custos',bloco:'proposta',titulo:'Composição de custos unitários e de encargos sociais',baseLegal:'Art. 6º, XXIV',busca:null});
  }

  // Declarações
  add({chave:'decl_menor',bloco:'declaracoes',titulo:'Declaração de cumprimento do art. 7º, XXXIII, da Constituição',baseLegal:'Art. 63, I',busca:null,gerado:true});
  add({chave:'decl_impeditivo',bloco:'declaracoes',titulo:'Declaração de inexistência de fato impeditivo',baseLegal:'Art. 63, I',busca:null,gerado:true});
  add({chave:'decl_conhecimento',bloco:'declaracoes',titulo:'Declaração de pleno conhecimento e aceitação do edital',baseLegal:'Art. 63',busca:null,gerado:true});
  add({chave:'decl_reserva_cargos',bloco:'declaracoes',titulo:'Declaração de cumprimento da reserva legal de cargos',baseLegal:'Art. 63, IV',busca:null,gerado:true});
  add({chave:'decl_conflito',bloco:'declaracoes',titulo:'Declaração de inexistência de conflito de interesse',baseLegal:'Art. 9º',busca:null,gerado:true});
  if(!p.temCertame||['pregao','concorrencia'].includes(p.modalidade))
    add({chave:'decl_independente',bloco:'declaracoes',titulo:'Declaração de elaboração independente da proposta',baseLegal:'Art. 63',busca:null,gerado:true});
  if(p.meEpp!=='nao')
    add({chave:'decl_me_epp',bloco:'declaracoes',titulo:'Declaração de enquadramento como ME/EPP',baseLegal:'LC 123/2006, arts. 42 a 49',busca:{categoria:'Declarações',tipos:[/me\/epp|microempresa|pequeno porte|enquadramento/i]}});

  // Processo de contratação direta
  if(!p.temCertame){
    add({chave:'justificativa_enquadramento',bloco:'processo_contratacao_direta',titulo:`Justificativa do enquadramento legal${p.formaDireta==='inexigibilidade'?' e da inviabilidade de competição':''}`,baseLegal:p.formaDireta==='inexigibilidade'?'Art. 74':'Art. 75',busca:null});
    add({chave:'pesquisa_precos',bloco:'processo_contratacao_direta',titulo:'Pesquisa de preços e justificativa do preço contratado',baseLegal:'Art. 23',busca:null});
    add({chave:'dfd',bloco:'processo_contratacao_direta',titulo:'Documento de formalização da demanda (DFD) e termo de referência',baseLegal:'Art. 72, I',busca:null});
    add({chave:'autorizacao_autoridade',bloco:'processo_contratacao_direta',titulo:'Autorização da autoridade competente',baseLegal:'Art. 72, VIII',busca:null});
    if(p.formaDireta==='inexigibilidade')
      add({chave:'exclusividade',bloco:'processo_contratacao_direta',titulo:'Comprovação de exclusividade ou de notória especialização',baseLegal:'Art. 74, I e III',busca:{categoria:'Atestados técnicos'}});
  }
  return itens;
}

function moeda(v){return `R$ ${numero(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}`}

/* ---------------------------------------------------------------------------
   Motor de crítica: recebe o processo e o checklist já vinculado ao acervo e
   devolve pendências, alertas e o status sugerido do processo.
--------------------------------------------------------------------------- */
const DIAS_ALERTA_VALIDADE=10;
const diasEntre=(a,b)=>Math.round((new Date(`${b}T12:00:00`)-new Date(`${a}T12:00:00`))/86400000);
const hojeIso=()=>new Date().toISOString().slice(0,10);

function criticarProcesso(processo,itens,contexto){
  contexto=contexto||{};
  const pendencias=[],alertas=[],p=processo||{},lista=itens||[];
  const abertura=p.opening||null;
  const valor=numero(p.valorEstimado);

  // 6.1 Vigência
  lista.forEach(item=>{
    if(item.status==='nao_aplicavel')return;
    const venceAntes=item.validade&&abertura&&item.validade<abertura;
    if(venceAntes)
      pendencias.push({chave:item.chave,tipo:'vigencia',titulo:item.titulo,texto:`Vence em ${br(item.validade)}, antes da sessão de ${br(abertura)}.`});
    else if(item.validade&&abertura&&diasEntre(abertura,item.validade)<=DIAS_ALERTA_VALIDADE)
      alertas.push({chave:item.chave,tipo:'vigencia',titulo:item.titulo,texto:`Vence ${diasEntre(abertura,item.validade)} dia(s) depois da sessão. Revalide por segurança.`});
    // A pendência de vigência já cobre o vencido: não repetir como completude.
    if(!venceAntes&&item.obrigatorio&&['ausente','pendente','vencido'].includes(item.status))
      pendencias.push({chave:item.chave,tipo:'completude',titulo:item.titulo,texto:item.status==='vencido'?'Documento vencido para a data da sessão.':'Documento obrigatório ainda não vinculado.'});
  });

  // 6.2 Completude da proposta
  const itensEdital=(p.items||[]).length;
  if(itensEdital===0&&lista.some(i=>i.chave==='planilha_precos'))
    alertas.push({tipo:'completude',titulo:'Planilha de itens',texto:'Nenhum item importado. Importe a planilha do órgão ou confira o edital.'});

  // 6.3 Consistência
  if(p.temCertame!==false&&p.modalidade==='pregao'&&['obras','servicos_especiais_engenharia'].includes(p.tipoObjeto))
    alertas.push({tipo:'consistencia',titulo:'Modalidade x objeto',texto:'Pregão destina-se a bens e serviços comuns. Obras e serviços especiais de engenharia normalmente exigem concorrência.'});
  if(p.temCertame!==false&&p.modalidade==='leilao'&&p.tipoObjeto!=='alienacao_bens')
    alertas.push({tipo:'consistencia',titulo:'Modalidade x objeto',texto:'Leilão é usado para alienação de bens. Confira a classificação do objeto.'});
  if(p.temCertame===false&&p.formaDireta==='dispensa'&&valor>0){
    const limite=engenharia(p.tipoObjeto)?parametro('dispensa_art75_I'):parametro('dispensa_art75_II');
    if(valor>limite)
      alertas.push({tipo:'consistencia',titulo:'Teto de dispensa por valor',texto:`Valor estimado (${moeda(valor)}) acima do limite vigente de ${moeda(limite)}. Confirme se o inciso do art. 75 usado não é o de dispensa por valor.`});
  }
  if(p.meEpp&&p.meEpp!=='nao'){
    const decl=lista.find(i=>i.chave==='decl_me_epp');
    if(decl&&['ausente','pendente'].includes(decl.status))
      pendencias.push({chave:'decl_me_epp',tipo:'consistencia',titulo:'Enquadramento ME/EPP',texto:'O processo tem tratamento diferenciado, mas a empresa não tem o enquadramento comprovado.'});
  }
  const pl=contexto.patrimonioLiquido;
  if(valor>0&&lista.some(i=>i.chave==='patrimonio_liquido')&&pl!=null&&numero(pl)>0&&numero(pl)<valor*0.1)
    pendencias.push({chave:'patrimonio_liquido',tipo:'consistencia',titulo:'Patrimônio líquido',texto:`Informado ${moeda(pl)} contra a exigência de até ${moeda(valor*0.1)} (10% do valor estimado).`});

  // 6.5 Prazo
  if(abertura){
    const dias=diasEntre(hojeIso(),abertura);
    if(dias<0)alertas.push({tipo:'prazo',titulo:'Sessão já realizada',texto:`A data da sessão (${br(abertura)}) já passou.`});
    else if(dias<=3)alertas.push({tipo:'prazo',titulo:'Prazo curto',texto:`Faltam ${dias} dia(s) para a sessão. Priorize as pendências abertas.`});
  }

  const criticas=pendencias.length;
  const status=criticas===0?(lista.length?'pronto':'rascunho'):(lista.length?'em_conferencia':'rascunho');
  return {pendencias,alertas,status,resumo:contar(lista)};
}

function contar(lista){
  const r={total:lista.length,ok:0,pendente:0,vencido:0,ausente:0,nao_aplicavel:0,gerado:0};
  lista.forEach(i=>{if(r[i.status]!=null)r[i.status]++});
  r.prontos=r.ok+r.gerado;
  r.criticos=r.pendente+r.vencido+r.ausente;
  return r;
}
function br(iso){return iso?iso.split('-').reverse().join('/'):'—'}
const TIPOS={vigencia:'Vigência',completude:'Completude',consistencia:'Consistência',prazo:'Prazo',elegibilidade:'Elegibilidade'};
const rotuloTipo=t=>TIPOS[t]||t;

global.Regras={
  catalogoDocumentos,tipoDocumento,tiposQueAtendem,tiposBase,classificarNoCatalogo,
  modalidades,formasDiretas,tiposObjeto,criterios,modosDisputa,regimesExecucao,
  procedimentosAuxiliares,meEpp,blocos,
  calcularMatrizDocumentos,criticarProcesso,contar,
  acervoVigente,prontidaoDaEmpresa,situacaoDoDocumento,ROTULO_PRONTIDAO,DIAS_VENCE_LOGO,
  exigeEconomicoFinanceiro,exigeTecnica,engenharia,
  definirParametros,parametro,parametrosPadrao,
  rotulo,rotuloTipo,moeda,numero,diasEntre,hojeIso,br,
  LIMIAR_ECONOMICO
};
})(window);
