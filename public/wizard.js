/* Assistente de habilitação: quebra o cadastro de edital em passos, calcula a
   matriz de documentos exigíveis pela classificação e cruza com o acervo da empresa.
   Depende dos globais de app.js (client, state, $, esc, toast...) e de Regras. */
(function(){
'use strict';

const PASSOS=[
  {k:'origem',t:'Origem',sub:'PDF ou manual'},
  {k:'identificacao',t:'Identificação',sub:'Dados do edital'},
  {k:'classificacao',t:'Classificação',sub:'Modalidade e objeto'},
  {k:'juridica',t:'Habilitação',sub:'Jurídica e fiscal',blocos:['juridica','fiscal_trabalhista']},
  {k:'economica',t:'Econ.-financeira',sub:'Balanço e índices',blocos:['economico_financeira']},
  {k:'tecnica',t:'Técnica',sub:'Atestados e registros',blocos:['tecnica']},
  {k:'proposta',t:'Proposta',sub:'Itens e declarações',blocos:['proposta','declaracoes','processo_contratacao_direta']},
  {k:'revisao',t:'Revisão',sub:'Checklist final'}
];

let wiz=null;

const hoje=()=>new Date().toISOString().slice(0,10);
const num=v=>Regras.numero(v);
const moedaInput=v=>{const n=num(v);return n?n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):''};
const diasAte=iso=>iso?Regras.diasEntre(hoje(),iso):null;

/* Converte a linha de licitacoes no objeto que o motor de regras entende. */
function processoDaLicitacao(n){
  return {temCertame:n.temCertame!==false,modalidade:n.modalidadePadrao,formaDireta:n.formaDireta,
    tipoObjeto:n.tipoObjeto,criterio:n.criterio,regime:n.regime,meEpp:n.meEpp,
    valorEstimado:n.valorEstimado,opening:n.opening,items:n.items};
}

/* --------------------------------------------------------------------------
   Vinculação com o acervo
-------------------------------------------------------------------------- */
function candidatosAcervo(item,companyId){
  // O catálogo é a via exata: se algum tipo declara atender esta exigência,
  // usa os documentos já classificados nele. A busca por texto fica de reserva
  // para o acervo que ainda não passou pelo "Organizar acervo".
  const tipos=Regras.tiposQueAtendem(item.chave).map(t=>t.chave);
  if(tipos.length){
    const porCatalogo=acervoDaEmpresa(companyId).filter(d=>tipos.includes(d.chave));
    if(porCatalogo.length)
      return porCatalogo
        .sort((x,y)=>(y.validade||y.data||'').localeCompare(x.validade||x.data||''))
        .map(d=>({tabela:d.origem,id:d.id,path:d.path,validade:d.validade,
          nome:`${d.rotulo}${d.validade?` — validade ${fmt(d.validade)}`:d.data?` — ${fmt(d.data)}`:''}`}));
  }
  const b=item.busca;
  if(!b)return[];
  if(b.certidao)
    return state.certificates.filter(c=>c.companyId===companyId&&c.type===b.certidao&&c.validity)
      .sort((x,y)=>y.validity.localeCompare(x.validity))
      .map(c=>({tabela:'certidoes',id:c.id,path:c.filePath,validade:c.validity,nome:`${c.type} — validade ${fmt(c.validity)}`}));
  if(b.balanco)
    return state.balances.filter(x=>x.companyId===companyId).sort((x,y)=>Number(y.year)-Number(x.year))
      .map(x=>({tabela:'balancos',id:x.id,path:x.filePath,validade:null,nome:`Balanço ${x.year} — ${x.documentType||'anual'}`}));
  return state.documents.filter(d=>d.companyId===companyId
      &&(!b.categoria||d.category===b.categoria)
      &&(!b.tipos||b.tipos.some(rx=>rx.test(`${d.type||''} ${d.name||''}`))))
    .sort((x,y)=>(y.documentDate||y.createdAt||'').localeCompare(x.documentDate||x.createdAt||''))
    .map(d=>({tabela:'documentos_empresa',id:d.id,path:d.filePath,validade:d.validity||null,nome:`${d.type||d.name}${d.validity?` — validade ${fmt(d.validity)}`:''}`}));
}

/* Todo o acervo da empresa, para quando o documento certo não casa com a busca.
   Memoizado por render: sem isso a lista era reordenada uma vez por linha. */
let cacheAcervo=null;
function todoAcervo(companyId){
  if(cacheAcervo&&cacheAcervo.companyId===companyId)return cacheAcervo.lista;
  const lista=montarTodoAcervo(companyId);
  cacheAcervo={companyId,lista};
  return lista;
}
function montarTodoAcervo(companyId){
  const docs=state.documents.filter(d=>d.companyId===companyId)
    .map(d=>({tabela:'documentos_empresa',id:d.id,path:d.filePath,validade:d.validity||null,nome:`${d.category} · ${d.type||d.name}`}));
  const certs=state.certificates.filter(c=>c.companyId===companyId)
    .map(c=>({tabela:'certidoes',id:c.id,path:c.filePath,validade:c.validity,nome:`Certidões · ${c.type} — ${fmt(c.validity)}`}));
  const bals=state.balances.filter(b=>b.companyId===companyId)
    .map(b=>({tabela:'balancos',id:b.id,path:b.filePath,validade:null,nome:`Balanços · ${b.year}`}));
  return [...certs,...bals,...docs].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')).slice(0,300);
}

/* Critério de item acumulativo, leitura/gravação de vínculos e status —
   compartilhado com app.js, que precisa exatamente da mesma lógica para a
   tela do edital. Vive em Regras (regras-licitacao.js) para não duplicar. */
const statusDoVinculo=Regras.statusDoVinculo;
const itemAcumulativo=Regras.itemAcumulativo;
const vinculosDoItem=Regras.vinculosDoItem;
const statusDosVinculos=Regras.statusDosVinculos;
const aplicarVinculos=Regras.aplicarVinculos;

/* Monta o checklist do processo: matriz calculada + o que já estava salvo.
   Não sobrescreve vínculo existente nem decisão manual do usuário. */
function montarChecklist(notice,salvos){
  const companyId=notice.companyId,dataAlvo=notice.opening||hoje();
  const matriz=Regras.calcularMatrizDocumentos(processoDaLicitacao(notice));
  const porChave=new Map((salvos||[]).map(x=>[x.chave,x]));
  return matriz.map(item=>{
    const antigo=porChave.get(item.chave);
    const base={chave:item.chave,bloco:item.bloco,titulo:item.titulo,baseLegal:item.baseLegal||'',
      ordem:item.ordem,obrigatorio:item.obrigatorio,busca:item.busca,gerado:!!item.gerado};
    if(antigo){
      const novo={...base,id:antigo.id,aplicavel:antigo.aplicavel,justificativa:antigo.justificativa||'',observacao:antigo.observacao||''};
      aplicarVinculos(novo,vinculosDoItem(antigo),dataAlvo);
      return novo;
    }
    const candidatos=candidatosAcervo(item,companyId);
    const novo={...base,id:null,aplicavel:true,justificativa:'',observacao:''};
    aplicarVinculos(novo,itemAcumulativo(item)?candidatos:candidatos.slice(0,1),dataAlvo);
    return novo;
  });
}

/* Refaz o casamento automático de tudo que ainda não tem documento vinculado. */
function revincular(){
  const dataAlvo=wiz.notice.opening||hoje();
  let ligados=0;
  wiz.itens.forEach(item=>{
    if(vinculosDoItem(item).length||item.aplicavel===false||item.gerado)return;
    const candidatos=candidatosAcervo(item,wiz.notice.companyId);
    if(!candidatos.length)return;
    aplicarVinculos(item,itemAcumulativo(item)?candidatos:candidatos.slice(0,1),dataAlvo);
    ligados++;
  });
  renderPasso();
  toast(ligados?`${ligados} documento(s) vinculado(s) do acervo.`:'Nenhum documento novo encontrado no acervo.');
}

/* --------------------------------------------------------------------------
   Persistência
-------------------------------------------------------------------------- */
function payloadLicitacao(d){
  return {empresa_id:d.companyId,numero:d.number,orgao:d.agency,objeto:d.object,
    abertura:d.opening||null,hora_sessao:d.horaSessao||null,modalidade:d.modality||null,link_portal:d.linkPortal||null,
    tem_certame:d.temCertame!==false,
    modalidade_padrao:d.temCertame!==false?(d.modalidadePadrao||null):null,
    forma_contratacao_direta:d.temCertame===false?(d.formaDireta||null):null,
    fundamento_legal:d.fundamentoLegal||null,tipo_objeto:d.tipoObjeto||null,
    criterio_julgamento:d.criterio||null,modo_disputa:d.modoDisputa||null,regime_execucao:d.regime||null,
    exclusividade_me_epp:d.meEpp||'nao',valor_estimado:d.valorEstimado!=null&&d.valorEstimado!==''?num(d.valorEstimado):null,
    procedimento_auxiliar:d.procedimentoAuxiliar||null,status_processo:d.statusProcesso||'rascunho',
    interesse:d.interesse||'em_analise',prioridade:d.prioridade||'media',
    responsavel:d.responsavel||null,anotacoes:d.anotacoes||null,decidir_ate:d.decidirAte||null,
    requisitos:d.requirements||[],requisitos_proposta:d.proposalRequirements||[],
    declaracoes:d.declarations||[],itens:d.items||[]};
}

async function salvarProcesso(){
  const d=wiz.notice;
  if(wiz.arquivoEdital&&!d.filePath){
    d.filePath=await uploadDocument(wiz.arquivoEdital,d.companyId,`processos/${safeFolder(d.number||'edital')}/edital`);
    wiz.arquivoEdital=null;
  }
  const payload=payloadLicitacao(d);
  payload.edital_path=d.filePath||null;
  if(d.id){
    const {error}=await client.from('licitacoes').update(payload).eq('id',d.id);
    if(error)throw error;
    return d.id;
  }
  payload.criado_por=state.user.id;
  payload.texto_extraido=d.extractedText||null;
  const {data,error}=await client.from('licitacoes').insert(payload).select().single();
  if(error)throw error;
  d.id=data.id;
  return data.id;
}

async function salvarChecklist(){
  const licitacaoId=wiz.notice.id;
  if(!licitacaoId||!wiz.itens.length)return;
  const linhas=wiz.itens.map(i=>({empresa_id:wiz.notice.companyId,licitacao_id:licitacaoId,chave:i.chave,
    bloco:i.bloco,titulo:i.titulo,base_legal:i.baseLegal||null,ordem:i.ordem,obrigatorio:i.obrigatorio,
    aplicavel:i.aplicavel!==false,justificativa_nao_aplicavel:i.justificativa||null,
    documento_ref_tabela:i.documentoRefTabela||null,documento_ref_id:i.documentoRefId||null,
    documento_ref_path:i.documentoRefPath||null,validade:i.validade||null,
    documentos_vinculados:i.documentosVinculados||[],
    status:i.status,observacao:i.observacao||null,atualizado_em:new Date().toISOString()}));
  const {error}=await client.from('licitacao_checklist_itens').upsert(linhas,{onConflict:'licitacao_id,chave'});
  if(error)throw error;
  const chaves=wiz.itens.map(i=>i.chave);
  await client.from('licitacao_checklist_itens').delete().eq('licitacao_id',licitacaoId).not('chave','in',`(${chaves.map(c=>`"${c}"`).join(',')})`);
}

/* --------------------------------------------------------------------------
   Render
-------------------------------------------------------------------------- */
function passoAplicavel(i){
  const p=PASSOS[i];
  if(!p.blocos||!wiz.itens.length)return true;
  return wiz.itens.some(it=>p.blocos.includes(it.bloco));
}

function renderStepper(){
  $('#wizard-stepper').innerHTML=PASSOS.map((p,i)=>{
    const aplic=passoAplicavel(i);
    const cls=['wz-step',i===wiz.passo?'current':'',i<wiz.passo&&aplic?'done':'',!aplic?'skip':''].filter(Boolean).join(' ');
    return `<button type="button" class="${cls}" data-passo="${i}"${i>wiz.maxPasso?' disabled':''}>
      <span class="ix">${i+1}</span><span class="lbl"><b>${esc(p.t)}</b><span>${aplic?esc(p.sub):'Não exigido'}</span></span></button>`;
  }).join('');
}

function renderCabecalho(){
  const n=wiz.notice,dias=diasAte(n.opening),critica=wiz.critica||{resumo:Regras.contar([]),pendencias:[],alertas:[]};
  const chips=[];
  if(n.opening)chips.push(`<span class="wz-chip${dias!=null&&dias<=5?' warn':''}"><b>${dias!=null&&dias>=0?dias:'—'}</b> dia(s) até a sessão · ${fmt(n.opening)}</span>`);
  if(n.tipoObjeto)chips.push(`<span class="wz-chip">${esc(Regras.rotulo(Regras.tiposObjeto,n.tipoObjeto))}</span>`);
  if(num(n.valorEstimado))chips.push(`<span class="wz-chip">Valor estimado <b>${esc(Regras.moeda(n.valorEstimado))}</b></span>`);
  if(wiz.itens.length)chips.push(`<span class="wz-chip${critica.pendencias.length?' warn':' ok'}"><b>${critica.pendencias.length}</b> pendência(s) crítica(s)</span>`);
  $('#wizard-meta').innerHTML=chips.join('');
}

function selectOptions(lista,valor){return lista.map(o=>`<option value="${esc(o.v)}"${o.v===valor?' selected':''}>${esc(o.n)}</option>`).join('')}

function renderPassoOrigem(){
  const temPdf=!!lastPdfAnalysis;
  return `<h2>Origem do processo</h2>
  <p class="wz-hint">O assistente lê o edital em PDF e pré-preenche os próximos passos, ou você começa do zero. Tudo continua editável.</p>
  <div class="wz-radios">
    <label class="wz-radio"><input type="radio" name="origem" value="pdf"${wiz.origem==='pdf'?' checked':''}><span><b>Ler edital em PDF</b><small>Leitura local no navegador: número, órgão, objeto, modalidade, abertura e exigências.</small></span></label>
    <label class="wz-radio"><input type="radio" name="origem" value="manual"${wiz.origem==='manual'?' checked':''}><span><b>Preencher manualmente</b><small>Sem PDF ainda — os campos ficam em branco para digitação.</small></span></label>
  </div>
  <div id="wz-origem-pdf"${wiz.origem==='pdf'?'':' hidden'}>
    <label class="wz-field full">Edital ou termo de referência em PDF<input type="file" id="wz-pdf" accept="application/pdf,.pdf"></label>
    <button type="button" class="secondary" id="wz-ler-pdf">Extrair e analisar</button>
    <div id="wz-pdf-progresso" class="reader-progress" hidden></div>
    ${temPdf?`<div class="success-box"><strong>Leitura disponível:</strong> ${esc(lastPdfAnalysis.number||'edital')} · ${lastPdfAnalysis.pages} página(s), ${lastPdfAnalysis.requirements.length} exigência(s) localizada(s). Os campos do próximo passo já vêm preenchidos.</div>`:''}
  </div>`;
}

function renderPassoIdentificacao(){
  const n=wiz.notice,opts=state.companies.map(c=>`<option value="${c.id}"${c.id===n.companyId?' selected':''}>${esc(c.name)}</option>`).join('');
  return `<h2>Identificação do processo</h2>
  <p class="wz-hint">Confira os dados do edital. O rascunho é salvo ao avançar, então dá para voltar depois com a documentação em mãos.</p>
  <div class="wz-grid">
    <label class="wz-field full">Empresa participante<select data-campo="companyId" required><option value="">Selecione</option>${opts}</select></label>
    <label class="wz-field">Número/identificação<input data-campo="number" value="${esc(n.number||'')}" placeholder="Pregão Eletrônico nº 000/2026"></label>
    <label class="wz-field">Órgão/entidade<input data-campo="agency" value="${esc(n.agency||'')}"></label>
    <label class="wz-field full">Objeto<textarea data-campo="object" rows="3">${esc(n.object||'')}</textarea></label>
    <label class="wz-field">Data da sessão<input type="date" data-campo="opening" value="${esc(n.opening||'')}"></label>
    <label class="wz-field">Horário<input type="time" data-campo="horaSessao" value="${esc(n.horaSessao||'')}"></label>
    <label class="wz-field full">Link no PNCP ou portal<input data-campo="linkPortal" value="${esc(n.linkPortal||'')}" placeholder="pncp.gov.br/app/editais/..."></label>
  </div>
  ${n.opening&&diasAte(n.opening)<0?'<div class="warning">A data informada já passou. Confira antes de seguir.</div>':''}
  ${n.opening&&diasAte(n.opening)>=0&&diasAte(n.opening)<=3?`<div class="warning"><strong>Prazo curto:</strong> faltam ${diasAte(n.opening)} dia(s) para a sessão.</div>`:''}`;
}

function renderPassoClassificacao(){
  const n=wiz.notice,certame=n.temCertame!==false;
  const alertas=(wiz.critica?.alertas||[]).filter(a=>a.tipo==='consistencia');
  return `<h2>Classificação do processo</h2>
  <p class="wz-hint">É daqui que sai a matriz de documentos exigíveis. Mude os campos e os passos seguintes se recalculam.</p>
  <div class="wz-radios">
    <label class="wz-radio"><input type="radio" name="certame" value="sim"${certame?' checked':''}><span><b>Há certame formal</b><small>Uma das cinco modalidades do art. 28.</small></span></label>
    <label class="wz-radio"><input type="radio" name="certame" value="nao"${!certame?' checked':''}><span><b>Contratação direta</b><small>Dispensa (art. 75) ou inexigibilidade (art. 74).</small></span></label>
  </div>
  <div class="wz-grid">
    ${certame
      ?`<label class="wz-field">Modalidade<select data-campo="modalidadePadrao"><option value="">Selecione</option>${selectOptions(Regras.modalidades,n.modalidadePadrao)}</select></label>`
      :`<label class="wz-field">Forma de contratação direta<select data-campo="formaDireta"><option value="">Selecione</option>${selectOptions(Regras.formasDiretas,n.formaDireta)}</select></label>
        <label class="wz-field">Fundamento legal<input data-campo="fundamentoLegal" value="${esc(n.fundamentoLegal||'')}" placeholder="art. 75, II"></label>`}
    <label class="wz-field">Tipo de objeto<select data-campo="tipoObjeto"><option value="">Selecione</option>${selectOptions(Regras.tiposObjeto,n.tipoObjeto)}</select></label>
    <label class="wz-field">Valor estimado<input data-campo="valorEstimado" inputmode="decimal" value="${esc(moedaInput(n.valorEstimado))}" placeholder="0,00"></label>
    <label class="wz-field">Critério de julgamento<select data-campo="criterio">${selectOptions(Regras.criterios,n.criterio||'menor_preco')}</select></label>
    ${certame&&['pregao','concorrencia'].includes(n.modalidadePadrao)?`<label class="wz-field">Modo de disputa<select data-campo="modoDisputa"><option value="">Selecione</option>${selectOptions(Regras.modosDisputa,n.modoDisputa)}</select></label>`:''}
    ${Regras.engenharia(n.tipoObjeto)?`<label class="wz-field">Regime de execução<select data-campo="regime"><option value="">Selecione</option>${selectOptions(Regras.regimesExecucao,n.regime)}</select></label>`:''}
    <label class="wz-field">Tratamento ME/EPP<select data-campo="meEpp">${selectOptions(Regras.meEpp,n.meEpp||'nao')}</select></label>
    <label class="wz-field">Procedimento auxiliar<select data-campo="procedimentoAuxiliar">${selectOptions(Regras.procedimentosAuxiliares,n.procedimentoAuxiliar||'')}</select></label>
  </div>
  ${alertas.length
    ?alertas.map(a=>`<div class="warning"><strong>${esc(a.titulo)}:</strong> ${esc(a.texto)}</div>`).join('')
    :'<div class="success-box">Classificação consistente com as regras gerais da Lei 14.133/2021. A matriz dos próximos passos foi recalculada.</div>'}
  <p class="wz-hint">A matriz é sugestão de partida. Cada edital pode acrescentar ou flexibilizar exigências dentro dos limites legais.</p>`;
}

const ROTULO_STATUS=Regras.rotuloChecklist;

/* Itens acumulativos (representante legal, responsável técnico, atestados...)
   aceitam vários documentos ao mesmo tempo: cada sócio, cada profissional tem
   o seu. Mostra a lista inteira, um "Remover" por documento, e o mesmo select
   de sempre serve para ACRESCENTAR mais um, em vez de trocar o único. */
function renderLinhaItemAcumulativo(item,indice){
  const naoAplica=item.aplicavel===false;
  const vinculos=vinculosDoItem(item);
  let sub=item.baseLegal||'';
  if(!item.obrigatorio)sub+=`${sub?' · ':''}exigível conforme o edital`;
  const candidatos=candidatosAcervo(item,wiz.notice.companyId)
    .filter(c=>!vinculos.some(v=>v.tabela===c.tabela&&v.id===c.id));
  const outros=todoAcervo(wiz.notice.companyId)
    .filter(o=>!vinculos.some(v=>v.tabela===o.tabela&&v.id===o.id)&&!candidatos.some(c=>c.tabela===o.tabela&&c.id===o.id));
  return `<div class="wz-item wz-item-multiplo${naoAplica?' inativo':''}" data-item="${indice}">
    <div class="wz-item-main">
      <strong>${esc(item.titulo)}</strong>
      <small>${esc(sub)}${vinculos.length?` · ${vinculos.length} documento(s) vinculado(s)`:''}</small>
      ${item.observacao?`<small class="wz-obs">${esc(item.observacao)}</small>`:''}
      ${naoAplica?`<small class="wz-obs">Justificativa: ${esc(item.justificativa||'não informada')}</small>`:''}
    </div>
    <div class="wz-item-acoes">
      ${naoAplica?'':`
      ${vinculos.length?`<ul class="wz-vinculos">${vinculos.map((v,i)=>`<li>
        <span>${esc(v.nome||v.path||'Documento')}</span>
        <span><button type="button" class="link" data-document="${esc(v.path)}">Abrir</button>
        <button type="button" class="link" data-remover-vinculo="${indice}:${i}">Remover</button></span>
      </li>`).join('')}</ul>`:''}
      <select data-vincular-mais="${indice}">
        <option value="">Vincular mais um do acervo…</option>
        ${candidatos.length?`<optgroup label="Compatíveis com a exigência">${candidatos.map(c=>`<option value="${c.tabela}:${c.id}">${esc(c.nome)}</option>`).join('')}</optgroup>`:''}
        ${outros.length?`<optgroup label="Outros documentos da empresa">${outros.map(c=>`<option value="${c.tabela}:${c.id}">${esc(c.nome)}</option>`).join('')}</optgroup>`:''}
      </select>
      <div class="wz-item-links">
        <button type="button" class="link" data-enviar="${indice}">Enviar novo agora ↑</button>
        <button type="button" class="link" data-agendar="${indice}">Agendar</button>
        <button type="button" class="link" data-na="${indice}">Não se aplica</button>
      </div>
      <div class="wz-upload" id="wz-upload-${indice}" hidden>
        <input type="file" data-arquivo="${indice}" accept=".pdf,.png,.jpg,.jpeg">
        <input type="date" data-validade="${indice}" title="Validade, se houver">
        <button type="button" class="secondary" data-salvar-upload="${indice}">Salvar no acervo e acrescentar</button>
        <small>Envia para o acervo da empresa e acrescenta à lista, sem substituir os já vinculados.</small>
      </div>`}
      ${naoAplica?`<button type="button" class="link" data-reativar="${indice}">Voltar a exigir</button>`:''}
    </div>
    <span class="badge ${item.status}">${ROTULO_STATUS[item.status]||item.status}</span>
  </div>`;
}

function renderLinhaItem(item,indice){
  if(itemAcumulativo(item))return renderLinhaItemAcumulativo(item,indice);
  const naoAplica=item.aplicavel===false;
  const doc=item.documentoRefPath;
  let sub=item.baseLegal||'';
  if(item.validade)sub+=`${sub?' · ':''}válido até ${fmt(item.validade)}`;
  if(!item.obrigatorio)sub+=`${sub?' · ':''}exigível conforme o edital`;
  const candidatos=candidatosAcervo(item,wiz.notice.companyId);
  // O acervo inteiro só é oferecido quando não há documento vinculado — é ali que
  // o usuário precisa garimpar. Nas linhas já resolvidas bastam os compatíveis.
  const outros=doc?[]:todoAcervo(wiz.notice.companyId).filter(o=>!candidatos.some(c=>c.tabela===o.tabela&&c.id===o.id));
  return `<div class="wz-item${naoAplica?' inativo':''}" data-item="${indice}">
    <div class="wz-item-main">
      <strong>${esc(item.titulo)}</strong>
      <small>${esc(sub)}</small>
      ${item.observacao?`<small class="wz-obs">${esc(item.observacao)}</small>`:''}
      ${naoAplica?`<small class="wz-obs">Justificativa: ${esc(item.justificativa||'não informada')}</small>`:''}
    </div>
    <div class="wz-item-acoes">
      ${naoAplica?'':`
      <select data-vincular="${indice}">
        <option value="">${doc?'Trocar documento…':'Vincular documento do acervo…'}</option>
        ${candidatos.length?`<optgroup label="Compatíveis com a exigência">${candidatos.map(c=>`<option value="${c.tabela}:${c.id}"${item.documentoRefId===c.id?' selected':''}>${esc(c.nome)}</option>`).join('')}</optgroup>`:''}
        ${outros.length?`<optgroup label="Outros documentos da empresa">${outros.map(c=>`<option value="${c.tabela}:${c.id}"${item.documentoRefId===c.id?' selected':''}>${esc(c.nome)}</option>`).join('')}</optgroup>`:''}
      </select>
      <div class="wz-item-links">
        ${doc?`<button type="button" class="link" data-document="${esc(doc)}">Abrir</button>`:''}
        ${doc?`<button type="button" class="link" data-desvincular="${indice}">Desvincular</button>`:`<button type="button" class="link" data-enviar="${indice}">Enviar agora ↑</button>`}
        <button type="button" class="link" data-agendar="${indice}">Agendar</button>
        <button type="button" class="link" data-na="${indice}">Não se aplica</button>
      </div>
      <div class="wz-upload" id="wz-upload-${indice}" hidden>
        <input type="file" data-arquivo="${indice}" accept=".pdf,.png,.jpg,.jpeg">
        <input type="date" data-validade="${indice}" title="Validade, se houver">
        <button type="button" class="secondary" data-salvar-upload="${indice}">Salvar no acervo e vincular</button>
        <small>Envia para o acervo da empresa e já preenche este item.</small>
      </div>`}
      ${naoAplica?`<button type="button" class="link" data-reativar="${indice}">Voltar a exigir</button>`:''}
    </div>
    <span class="badge ${item.status}">${ROTULO_STATUS[item.status]||item.status}</span>
  </div>`;
}

function renderPassoBlocos(passo){
  const p=PASSOS[passo],itens=wiz.itens.map((it,i)=>({it,i})).filter(x=>p.blocos.includes(x.it.bloco));
  const titulos={juridica:'Habilitação jurídica e fiscal/social/trabalhista',economica:'Qualificação econômico-financeira',tecnica:'Qualificação técnica',proposta:'Proposta e declarações'};
  if(!itens.length)
    return `<h2>${esc(titulos[p.k]||p.t)}</h2>
      <div class="wz-na"><span>Não exigido para este processo — a classificação do passo 2 não aciona este bloco. Se o edital exigir mesmo assim, volte e ajuste o tipo de objeto ou o valor estimado.</span><span class="badge nao_aplicavel">Não se aplica</span></div>`;
  const grupos=p.blocos.filter(b=>itens.some(x=>x.it.bloco===b));
  return `<h2>${esc(titulos[p.k]||p.t)}</h2>
  <p class="wz-hint">Calculado a partir da classificação. O que estiver ausente pode ser vinculado ao acervo, enviado na hora ou colocado na agenda para providenciar.</p>
  <div class="wz-acoes-bloco"><button type="button" class="secondary" id="wz-revincular">Procurar no acervo novamente</button></div>
  ${grupos.map(b=>`<div class="wz-bloco">
    <div class="wz-bloco-head"><h3>${esc(Regras.blocos[b].n)}</h3><span>${esc(Regras.blocos[b].base)}</span></div>
    ${itens.filter(x=>x.it.bloco===b).map(x=>renderLinhaItem(x.it,x.i)).join('')}
  </div>`).join('')}`;
}

function renderPassoProposta(){
  const n=wiz.notice;
  const itensPlanilha=(n.items||[]).length;
  return `${renderPassoBlocos(6)}
  <div class="wz-bloco">
    <div class="wz-bloco-head"><h3>Itens da proposta</h3><span>${itensPlanilha} item(ns)</span></div>
    ${itensPlanilha
      ?`<div class="table-wrap"><table><thead><tr><th>Item</th><th>Descrição</th><th>Un.</th><th>Qtd.</th><th>Unitário</th><th>Total</th></tr></thead><tbody>${(n.items||[]).slice(0,50).map(i=>`<tr><td>${esc(i.item)}</td><td>${esc(i.descricao)}</td><td>${esc(i.unidade)}</td><td>${esc(i.quantidade)}</td><td>${esc(i.valor_unitario||'')}</td><td>${esc(i.valor_total||'')}</td></tr>`).join('')}</tbody></table>${itensPlanilha>50?`<p class="wz-hint">Mostrando 50 de ${itensPlanilha} itens.</p>`:''}</div>`
      :'<div class="wz-na"><span>Nenhum item vinculado. Importe a planilha do órgão na aba Editais, ou preencha a proposta manualmente depois.</span></div>'}
  </div>`;
}

function renderPassoRevisao(){
  const r=wiz.critica.resumo,n=wiz.notice;
  const pend=wiz.critica.pendencias,alertas=wiz.critica.alertas;
  const blocosComItens=[...new Set(wiz.itens.filter(i=>i.aplicavel!==false).map(i=>i.bloco))];
  const arvore=Object.entries(Regras.blocos).map(([k,b])=>
    blocosComItens.includes(k)?`<span class="fold">${b.pasta}/</span>`:`<span class="skip">${b.pasta}/  (não exigido — omitido)</span>`
  ).concat(['<span class="fold">99-edital-e-anexos/</span>','00-checklist-completo.txt']).join('\n');
  return `<h2>Revisão final</h2>
  <p class="wz-hint">Consolidado de todos os blocos aplicáveis a este processo.</p>
  <div class="wz-kpis">
    <div class="wz-kpi ok"><b>${r.prontos}</b><span>documentos em dia</span></div>
    <div class="wz-kpi warn"><b>${r.pendente}</b><span>pendentes</span></div>
    <div class="wz-kpi bad"><b>${r.vencido}</b><span>vencidos p/ a sessão</span></div>
    <div class="wz-kpi bad"><b>${r.ausente}</b><span>ausentes</span></div>
  </div>
  ${pend.length?`<div class="wz-bloco"><div class="wz-bloco-head"><h3>Pendências críticas</h3><span>${pend.length}</span></div>
    ${pend.map(x=>`<div class="wz-pend"><span class="badge ausente">${esc(Regras.rotuloTipo(x.tipo))}</span><span><strong>${esc(x.titulo)}</strong><br><small>${esc(x.texto)}</small></span></div>`).join('')}
    <div class="wz-acoes-bloco"><button type="button" class="secondary" id="wz-agendar-tudo">Lançar todas as pendências na agenda</button>
    <button type="button" class="secondary" id="wz-checklist-pdf">Baixar checklist em PDF</button></div></div>`
    :`<div class="success-box"><strong>Nenhuma pendência crítica.</strong> Confira o edital original, as assinaturas e a validade na data da sessão antes de enviar.</div>
      <div class="wz-acoes-bloco"><button type="button" class="secondary" id="wz-checklist-pdf">Baixar checklist em PDF</button></div>`}
  ${alertas.length?`<div class="wz-bloco"><div class="wz-bloco-head"><h3>Alertas</h3><span>conferir</span></div>
    ${alertas.map(x=>`<div class="wz-pend"><span class="badge pendente">${esc(Regras.rotuloTipo(x.tipo))}</span><span><strong>${esc(x.titulo)}</strong><br><small>${esc(x.texto)}</small></span></div>`).join('')}</div>`:''}
  <div class="wz-bloco"><div class="wz-bloco-head"><h3>Estrutura do pacote a gerar</h3><span>pré-visualização</span></div>
    <pre class="wz-tree">${arvore}</pre></div>
  <div class="wz-bloco">
    <div class="wz-bloco-head"><h3>Interesse e acompanhamento</h3><span>agenda</span></div>
    <div class="wz-grid">
      <label class="wz-field">Interesse<select data-campo="interesse">${selectOptions([{v:'em_analise',n:'Em análise'},{v:'vamos_participar',n:'Vamos participar'},{v:'sem_interesse',n:'Sem interesse'},{v:'participamos',n:'Já participamos'}],n.interesse||'em_analise')}</select></label>
      <label class="wz-field">Prioridade<select data-campo="prioridade">${selectOptions([{v:'alta',n:'Alta'},{v:'media',n:'Média'},{v:'baixa',n:'Baixa'}],n.prioridade||'media')}</select></label>
      <label class="wz-field">Responsável<input data-campo="responsavel" value="${esc(n.responsavel||'')}" placeholder="Quem acompanha este processo"></label>
      <label class="wz-field">Decidir até<input type="date" data-campo="decidirAte" value="${esc(n.decidirAte||'')}"></label>
      <label class="wz-field full">Anotações<textarea data-campo="anotacoes" rows="2" placeholder="O que falta, com quem está, o que combinar">${esc(n.anotacoes||'')}</textarea></label>
    </div>
  </div>
  <p class="wz-hint">Nenhuma análise deste assistente substitui a conferência do edital original, das assinaturas e da validade na data da sessão.</p>`;
}

function renderPasso(){
  cacheAcervo=null;
  recalcular();
  renderStepper();
  renderCabecalho();
  const p=wiz.passo;
  let html='';
  if(p===0)html=renderPassoOrigem();
  else if(p===1)html=renderPassoIdentificacao();
  else if(p===2)html=renderPassoClassificacao();
  else if(p===6)html=renderPassoProposta();
  else if(p===7)html=renderPassoRevisao();
  else html=renderPassoBlocos(p);
  $('#wizard-body').innerHTML=html;
  $('#wizard-voltar').hidden=p===0;
  $('#wizard-avancar').hidden=p===7;
  $('#wizard-finalizar').hidden=p!==7;
  const criticas=wiz.critica.pendencias.length;
  $('#wizard-rodape').innerHTML=wiz.itens.length
    ?`<span class="${criticas?'wz-foot-warn':'wz-foot-ok'}">${criticas?`⚠ ${criticas} pendência(s) crítica(s) em aberto`:'✓ Nenhuma pendência crítica nos blocos aplicáveis'}</span>`
    :'<span>O checklist aparece depois da classificação.</span>';
}

function recalcular(){
  if(wiz.passo>=2&&wiz.notice.companyId){
    const anteriores=wiz.itens.map(i=>({chave:i.chave,id:i.id,aplicavel:i.aplicavel,justificativa:i.justificativa,
      observacao:i.observacao,documentoRefTabela:i.documentoRefTabela,documentoRefId:i.documentoRefId,
      documentoRefPath:i.documentoRefPath,validade:i.validade,status:i.status,documentosVinculados:i.documentosVinculados}));
    wiz.itens=montarChecklist(wiz.notice,anteriores.length?anteriores:wiz.salvos);
  }
  wiz.critica=Regras.criticarProcesso(processoDaLicitacao(wiz.notice),wiz.itens.filter(i=>i.aplicavel!==false),{});
}

/* --------------------------------------------------------------------------
   Navegação e abertura
-------------------------------------------------------------------------- */
function validarPasso(){
  if(wiz.passo===1){
    const n=wiz.notice;
    if(!n.companyId){toast('Selecione a empresa participante.');return false}
    if(!n.number?.trim()){toast('Informe o número ou identificação do processo.');return false}
    if(!n.agency?.trim()){toast('Informe o órgão ou entidade.');return false}
    if(!n.object?.trim()){toast('Informe o objeto.');return false}
  }
  if(wiz.passo===2){
    const n=wiz.notice;
    if(n.temCertame!==false&&!n.modalidadePadrao){toast('Selecione a modalidade.');return false}
    if(n.temCertame===false&&!n.formaDireta){toast('Selecione a forma de contratação direta.');return false}
    if(!n.tipoObjeto){toast('Selecione o tipo de objeto.');return false}
  }
  return true;
}

async function irPara(destino){
  if(destino>wiz.passo&&!validarPasso())return;
  if(wiz.passo>=1&&destino>wiz.passo){
    const botao=$('#wizard-avancar');
    setBusy(botao,true,'Salvando...');
    try{
      wiz.notice.statusProcesso=wiz.critica?.status||'rascunho';
      await salvarProcesso();
      if(wiz.itens.length)await salvarChecklist();
    }catch(error){toast(friendlyError(error));setBusy(botao,false);return}
    setBusy(botao,false);
  }
  let alvo=destino;
  while(alvo>0&&alvo<7&&!passoAplicavel(alvo))alvo+=destino>wiz.passo?1:-1;
  wiz.passo=Math.max(0,Math.min(7,alvo));
  wiz.maxPasso=Math.max(wiz.maxPasso,wiz.passo);
  renderPasso();
  $('#wizard-body').scrollTop=0;
}

function noticeVazia(){
  return {id:null,companyId:state.profile?.companyId||'',number:'',agency:'',object:'',opening:'',horaSessao:'',
    modality:'',linkPortal:'',temCertame:true,modalidadePadrao:'',formaDireta:'',fundamentoLegal:'',tipoObjeto:'',
    criterio:'menor_preco',modoDisputa:'',regime:'',meEpp:'nao',valorEstimado:'',procedimentoAuxiliar:'',
    statusProcesso:'rascunho',interesse:'em_analise',prioridade:'media',responsavel:'',anotacoes:'',decidirAte:'',
    requirements:[],proposalRequirements:[],declarations:[],items:[],filePath:null,extractedText:null};
}

function abrirWizard(noticeId){
  if(!state.companies.length){toast('Cadastre uma empresa primeiro.');return false}
  const existente=noticeId?state.notices.find(n=>n.id===noticeId):null;
  const salvos=noticeId?state.checklist.filter(c=>c.noticeId===noticeId):[];
  wiz={passo:existente?1:0,maxPasso:existente?7:0,origem:'pdf',itens:[],salvos,critica:null,
    notice:existente?{...noticeVazia(),...existente}:noticeVazia()};
  if(!existente&&typeof lastPdfAnalysis!=='undefined'&&lastPdfAnalysis){
    aplicarAnalise(lastPdfAnalysis);
    wiz.arquivoEdital=$('#pdf-input')?.files?.[0]||null;
    wiz.passo=1;wiz.maxPasso=1;
  }
  $('#wizard-titulo').textContent=existente?`Assistente — ${existente.number}`:'Assistente de habilitação';
  renderPasso();
  $('#wizard').showModal();
  return true;
}

/* Traz a leitura do PDF para dentro do wizard. */
function aplicarAnalise(a){
  const n=wiz.notice;
  n.number=n.number||a.number||'';
  n.agency=n.agency||a.agency||'';
  n.object=n.object||a.object||'';
  n.opening=n.opening||a.opening||'';
  n.modality=a.modality||n.modality;
  n.requirements=a.requirements||[];
  n.proposalRequirements=a.proposalRequirements||[];
  n.declarations=a.declarations||[];
  n.items=a.items||[];
  n.extractedText=a.text||null;
  const m=(a.modality||'').toLowerCase();
  if(!n.modalidadePadrao){
    if(/preg/.test(m))n.modalidadePadrao='pregao';
    else if(/concorr/.test(m))n.modalidadePadrao='concorrencia';
    else if(/leil/.test(m))n.modalidadePadrao='leilao';
    else if(/concurso/.test(m))n.modalidadePadrao='concurso';
  }
  if(/dispensa/.test(m)){n.temCertame=false;n.formaDireta='dispensa'}
}

/* --------------------------------------------------------------------------
   Eventos
-------------------------------------------------------------------------- */
function itemDoEvento(alvo,attr){const v=alvo?.dataset?.[attr];return v==null?null:wiz.itens[Number(v)]}

let ligado=false;
function ligarEventos(){
  if(ligado||!document.getElementById('wizard'))return;
  ligado=true;

  $('#wizard-avancar').addEventListener('click',()=>irPara(wiz.passo+1));
  $('#wizard-voltar').addEventListener('click',()=>irPara(wiz.passo-1));
  $('#wizard-fechar').addEventListener('click',async()=>{
    if(wiz?.notice?.companyId&&wiz.passo>=1){
      try{wiz.notice.statusProcesso=wiz.critica?.status||'rascunho';await salvarProcesso();if(wiz.itens.length)await salvarChecklist();await loadData();toast('Rascunho salvo. Você pode voltar quando tiver a documentação.')}
      catch(error){toast(friendlyError(error))}
    }
    $('#wizard').close();
  });
  $('#wizard-stepper').addEventListener('click',e=>{
    const b=e.target.closest('[data-passo]');
    if(b&&!b.disabled)irPara(Number(b.dataset.passo));
  });

  $('#wizard-body').addEventListener('change',async e=>{
    const t=e.target;
    if(t.name==='origem'){wiz.origem=t.value;renderPasso();return}
    if(t.name==='certame'){wiz.notice.temCertame=t.value==='sim';renderPasso();return}
    const campo=t.dataset.campo;
    if(campo){
      wiz.notice[campo]=campo==='valorEstimado'?num(t.value):t.value;
      if(['temCertame','modalidadePadrao','formaDireta','tipoObjeto','criterio','regime','meEpp','valorEstimado','opening'].includes(campo))renderPasso();
      else if(campo==='companyId')renderPasso();
      return;
    }
    const sel=t.dataset.vincular;
    if(sel!=null){
      const item=wiz.itens[Number(sel)];
      if(!t.value)return;
      const [tabela,refId]=t.value.split(':');
      const achado=[...candidatosAcervo(item,wiz.notice.companyId),...todoAcervo(wiz.notice.companyId)].find(c=>c.tabela===tabela&&c.id===refId);
      if(!achado)return;
      item.documentoRefTabela=achado.tabela;item.documentoRefId=achado.id;item.documentoRefPath=achado.path;
      item.validade=achado.validade;item.status=statusDoVinculo(achado,wiz.notice.opening||hoje());
      renderPasso();
      return;
    }
    const selMais=t.dataset.vincularMais;
    if(selMais!=null){
      const item=wiz.itens[Number(selMais)];
      if(!t.value)return;
      const [tabela,refId]=t.value.split(':');
      const achado=[...candidatosAcervo(item,wiz.notice.companyId),...todoAcervo(wiz.notice.companyId)].find(c=>c.tabela===tabela&&c.id===refId);
      if(!achado)return;
      aplicarVinculos(item,[...vinculosDoItem(item),achado],wiz.notice.opening||hoje());
      renderPasso();
    }
  });

  $('#wizard-body').addEventListener('input',e=>{
    const campo=e.target.dataset.campo;
    if(campo&&['number','agency','object','fundamentoLegal','linkPortal','responsavel','anotacoes'].includes(campo))
      wiz.notice[campo]=e.target.value;
  });

  $('#wizard-body').addEventListener('click',async e=>{
    const alvo=e.target.closest('button');
    if(!alvo)return;

    if(alvo.id==='wz-ler-pdf'){
      const file=$('#wz-pdf').files[0];
      if(!file){toast('Selecione um arquivo PDF.');return}
      const progresso=$('#wz-pdf-progresso');
      progresso.hidden=false;progresso.textContent='Abrindo o PDF...';
      setBusy(alvo,true,'Lendo...');
      try{
        lastPdfAnalysis=await extractPdf(file);
        aplicarAnalise(lastPdfAnalysis);
        wiz.arquivoEdital=file;
        progresso.textContent='Leitura concluída. Confira os dados no próximo passo.';
        renderPasso();
      }catch(error){progresso.textContent=`Não foi possível ler: ${friendlyError(error)}`}
      finally{setBusy(alvo,false)}
      return;
    }

    if(alvo.id==='wz-revincular'){revincular();return}

    if(alvo.id==='wz-checklist-pdf'){
      const company=state.companies.find(c=>c.id===wiz.notice.companyId);
      if(!company){toast('Selecione a empresa primeiro.');return}
      baixarChecklistPdf(company,wiz.notice,Regras.documentosDoChecklist(wiz.notice,wiz.itens));
      return;
    }

    if(alvo.id==='wz-agendar-tudo'){
      setBusy(alvo,true,'Lançando...');
      try{
        const criadas=await agendarPendencias(wiz.notice,wiz.critica.pendencias);
        await loadData();
        toast(criadas?`${criadas} providência(s) na agenda.`:'Todas as pendências já estavam na agenda.');
      }catch(error){toast(friendlyError(error))}
      finally{setBusy(alvo,false)}
      return;
    }

    const enviar=alvo.dataset.enviar;
    if(enviar!=null){
      const painel=$(`#wz-upload-${enviar}`);
      $$('.wz-upload').forEach(p=>{if(p!==painel)p.hidden=true});
      painel.hidden=!painel.hidden;
      return;
    }

    const salvarUpload=alvo.dataset.salvarUpload;
    if(salvarUpload!=null){
      const indice=Number(salvarUpload),item=wiz.itens[indice];
      const file=$(`[data-arquivo="${indice}"]`)?.files?.[0];
      const validade=$(`[data-validade="${indice}"]`)?.value||null;
      if(!file){toast('Selecione o arquivo.');return}
      setBusy(alvo,true,'Enviando...');
      try{
        const categoria=categoriaDoItem(item);
        const ano=(validade||hoje()).slice(0,4);
        const tipoChave=Regras.tiposQueAtendem(item.chave)[0]?.chave||null;
        const path=await uploadDocument(file,wiz.notice.companyId,`acervo/${safeFolder(categoria)}/${ano}`);
        const {data,error}=await client.from('documentos_empresa').insert({
          empresa_id:wiz.notice.companyId,categoria,tipo:item.titulo.slice(0,120),tipo_chave:tipoChave,nome_original:file.name,
          arquivo_path:path,origem:'Assistente de habilitação',validade:validade||null,
          sha256:await fileHash(file),metadados:{item:item.chave,licitacao:wiz.notice.id},criado_por:state.user.id
        }).select().single();
        if(error)throw error;
        const novoVinculo={tabela:'documentos_empresa',id:data.id,path,validade:validade||null,nome:file.name};
        aplicarVinculos(item,itemAcumulativo(item)?[...vinculosDoItem(item),novoVinculo]:[novoVinculo],wiz.notice.opening||hoje());
        await loadData();
        renderPasso();
        toast(itemAcumulativo(item)?'Documento enviado ao acervo e acrescentado.':'Documento enviado ao acervo e vinculado.');
      }catch(error){toast(friendlyError(error))}
      finally{setBusy(alvo,false)}
      return;
    }

    const desvincular=alvo.dataset.desvincular;
    if(desvincular!=null){
      const item=wiz.itens[Number(desvincular)];
      item.documentoRefTabela=null;item.documentoRefId=null;item.documentoRefPath=null;item.validade=null;
      item.documentosVinculados=[];
      item.status=item.gerado?'gerado':'ausente';
      renderPasso();
      return;
    }

    const removerVinculo=alvo.dataset.removerVinculo;
    if(removerVinculo!=null){
      const [indiceStr,posStr]=removerVinculo.split(':'),item=wiz.itens[Number(indiceStr)],pos=Number(posStr);
      const lista=vinculosDoItem(item).filter((_,i)=>i!==pos);
      aplicarVinculos(item,lista,wiz.notice.opening||hoje());
      renderPasso();
      return;
    }

    const na=alvo.dataset.na;
    if(na!=null){
      const item=wiz.itens[Number(na)];
      const justificativa=prompt(`Por que "${item.titulo}" não se aplica a este processo?`,item.justificativa||'');
      if(justificativa==null)return;
      if(!justificativa.trim()){toast('Informe a justificativa para marcar como não aplicável.');return}
      item.aplicavel=false;item.justificativa=justificativa.trim();item.status='nao_aplicavel';
      renderPasso();
      return;
    }

    const reativar=alvo.dataset.reativar;
    if(reativar!=null){
      const item=wiz.itens[Number(reativar)];
      item.aplicavel=true;item.justificativa='';
      aplicarVinculos(item,vinculosDoItem(item),wiz.notice.opening||hoje());
      renderPasso();
      return;
    }

    const agendar=alvo.dataset.agendar;
    if(agendar!=null){
      const item=wiz.itens[Number(agendar)];
      if(!wiz.notice.id){toast('Avance um passo para salvar o rascunho antes de agendar.');return}
      setBusy(alvo,true,'...');
      try{
        await agendarPendencias(wiz.notice,[{chave:item.chave,titulo:item.titulo,texto:item.baseLegal||''}]);
        await loadData();
        toast('Providência lançada na agenda.');
      }catch(error){toast(friendlyError(error))}
      finally{setBusy(alvo,false)}
    }
  });

  $('#wizard-finalizar').addEventListener('click',async()=>{
    const botao=$('#wizard-finalizar');
    setBusy(botao,true,'Gerando...');
    try{
      wiz.notice.statusProcesso=wiz.critica.status;
      await salvarProcesso();
      await salvarChecklist();
      await loadData();
      const pacoteId=await criarPacoteDoChecklist(wiz.notice,wiz.itens);
      $('#wizard').close();
      navigate('packages');
      toast('Processo salvo e pacote criado.');
      if(pacoteId)await downloadProcessPackage(pacoteId);
    }catch(error){toast(friendlyError(error))}
    finally{setBusy(botao,false)}
  });
}

function categoriaDoItem(item){
  const b=item.busca;
  if(b?.certidao)return'Certidões';
  if(b?.balanco)return'Balanços';
  if(b?.categoria)return b.categoria;
  return Regras.categoriaDoBloco[item.bloco]||'Outros';
}

document.addEventListener('DOMContentLoaded',ligarEventos);
if(document.readyState!=='loading')ligarEventos();

window.abrirWizard=abrirWizard;
window.montarChecklist=montarChecklist;
window.processoDaLicitacao=processoDaLicitacao;
window.categoriaDoItem=categoriaDoItem;
})();
