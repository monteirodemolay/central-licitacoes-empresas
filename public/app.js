const cfg=window.LICITADOC_CONFIG||{};
const client=window.supabase?.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);
const issuerLinks={'Federal/PGFN':'https://servicos.receitafederal.gov.br/servico/certidoes/','FGTS':'https://consulta-crf.caixa.gov.br/','CNDT':'https://cndt-certidao.tst.jus.br/'};
let state={user:null,profile:null,companies:[],documents:[],certificates:[],balances:[],notices:[],packages:[],profiles:[],checklist:[],agenda:[],trash:[],selectedNoticeId:null};
let lastPdfAnalysis=null;
let pendingCertificates=[];
let pendingArchive=[];
let sociosPendentes=[]; // {nome,file?,path?,arquivoNome?} do sócios do Contrato social em edição no modal
const $=s=>document.querySelector(s);const $$=s=>[...document.querySelectorAll(s)];
const id=()=>crypto.randomUUID();
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmt=d=>d?new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR'):'—';
const companyName=cid=>state.companies.find(c=>c.id===cid)?.name||'Empresa não localizada';
const isAdmin=()=>state.profile?.role==='admin_geral';
function status(date){if(!date)return'missing';const days=Math.ceil((new Date(`${date}T23:59:59`)-new Date())/86400000);if(days<0)return'expired';if(days<=15)return'urgent';return'ok'}
const statusLabel=s=>({expired:'Vencida',urgent:'Urgente',ok:'Regular',missing:'Pendente'}[s]);
function toast(text){const t=$('#toast');t.textContent=text;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}
function setBusy(button,busy,label='Salvando...'){if(!button)return;button.disabled=busy;if(busy){button.dataset.original=button.textContent;button.textContent=label}else button.textContent=button.dataset.original||button.textContent}
function showAuthMessage(message,success=false){const el=$('#auth-message');el.textContent=message;el.style.color=success?'var(--green)':'var(--red)'}
function friendlyError(error){const msg=error?.message||String(error);if(/Invalid login credentials/i.test(msg))return'E-mail ou senha incorretos.';if(/Email not confirmed/i.test(msg))return'Confirme seu e-mail antes de entrar.';if(/already registered/i.test(msg))return'Este e-mail já está cadastrado.';return msg}
function safeName(name){return name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]/g,'_').slice(-120)}
function safeFolder(name){return String(name||'outros').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80)||'outros'}
function cnpjDigits(value){return String(value||'').replace(/\D/g,'').slice(0,14)}
function formatCnpj(value){const v=cnpjDigits(value);return v.replace(/^(\d{2})(\d)/,'$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3').replace(/\.(\d{3})(\d)/,'.$1/$2').replace(/(\d{4})(\d)/,'$1-$2')}
function validCnpj(value){const v=cnpjDigits(value);if(v.length!==14||/^(\d)\1{13}$/.test(v))return false;const digit=base=>{let sum=0,weight=base.length-7;for(const n of base){sum+=Number(n)*weight--;if(weight<2)weight=9}const mod=sum%11;return mod<2?0:11-mod};return digit(v.slice(0,12))===Number(v[12])&&digit(v.slice(0,13))===Number(v[13])}
async function searchCnpj(){const input=$('#modal-content [name="cnpj"]'),button=$('#search-cnpj'),message=$('#cnpj-message'),cnpj=cnpjDigits(input?.value);if(!validCnpj(cnpj)){message.textContent='Informe um CNPJ válido com 14 dígitos.';message.className='field-message error';return}setBusy(button,true,'Consultando...');message.textContent='Consultando cadastro público...';message.className='field-message';let timer;try{const controller=new AbortController();timer=setTimeout(()=>controller.abort(),10000);const response=await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,{signal:controller.signal,headers:{Accept:'application/json'}});if(response.status===404)throw new Error('CNPJ não localizado na base consultada.');if(!response.ok)throw new Error('A consulta pública está temporariamente indisponível.');const data=await response.json(),activities=[data.cnae_fiscal_descricao,...(data.cnaes_secundarios||[]).map(x=>x.descricao)].filter(Boolean);const values={name:data.razao_social,trade:data.nome_fantasia,city:data.municipio,state:data.uf,openingDate:data.data_inicio_atividade,legalNature:data.natureza_juridica,size:data.descricao_porte||data.porte,activities:[...new Set(activities)].slice(0,15).join('; ')};Object.entries(values).forEach(([name,value])=>{const field=$(`#modal-content [name="${name}"]`);if(field&&value)field.value=value});input.value=formatCnpj(cnpj);message.textContent='Dados encontrados. Confira antes de salvar.';message.className='field-message success'}catch(error){message.textContent=error.name==='AbortError'?'A consulta demorou demais. Tente novamente ou preencha manualmente.':friendlyError(error);message.className='field-message error'}finally{clearTimeout(timer);setBusy(button,false)}}

async function init(){if(!client){showAuthMessage('Configuração do Supabase não encontrada.');return}const {data}=await client.auth.getSession();if(data.session)await enterApp(data.session.user);client.auth.onAuthStateChange(async(event,session)=>{if(event==='SIGNED_OUT')showLogin();else if(session&&!state.user)await enterApp(session.user)})}
async function enterApp(user){state.user=user;const {data:profile,error}=await client.from('perfis').select('*').eq('id',user.id).single();if(error){showAuthMessage('Execute primeiro o arquivo supabase/schema.sql no SQL Editor.');showLogin();return}state.profile={id:profile.id,email:profile.email,name:profile.nome,role:profile.perfil,companyId:profile.empresa_id};if(profile.perfil==='pendente'){$('#auth-screen').hidden=true;$('#pending-screen').hidden=false;document.body.classList.remove('authenticated');return}$('#auth-screen').hidden=true;$('#pending-screen').hidden=true;document.body.classList.add('authenticated');$('#user-label').textContent=profile.nome||profile.email;$('#access-nav').hidden=!isAdmin();$$('[data-open="company"]').forEach(b=>b.hidden=!isAdmin());await loadData();navigate('dashboard')}
function showLogin(){state={user:null,profile:null,companies:[],documents:[],certificates:[],balances:[],notices:[],packages:[],profiles:[],checklist:[],agenda:[],trash:[],selectedNoticeId:null};document.body.classList.remove('authenticated');$('#pending-screen').hidden=true;$('#auth-screen').hidden=false}
async function activeRows(table,order,ascending=true){let result=await client.from(table).select('*').is('excluido_em',null).order(order,{ascending});if(result.error&&/excluido_em/i.test(result.error.message))result=await client.from(table).select('*').order(order,{ascending});return result}
async function deletedRows(table){const result=await client.from(table).select('*').not('excluido_em','is',null).order('excluido_em',{ascending:false});return result.error&&/excluido_em|does not exist/i.test(result.error.message)?{data:[],error:null}:result}
function trashItem(entity,table,row){const definitions={company:[row.razao_social,row.cnpj,null],certificate:[row.tipo,`Validade: ${fmt(row.validade)}`,row.arquivo_path],document:[row.tipo||row.nome_original,row.categoria,row.arquivo_path],balance:[`Balanço — exercício ${row.exercicio}`,row.tipo_documento,row.arquivo_path],notice:[`Edital ${row.numero}`,row.orgao,row.edital_path],package:[row.nome,`${(row.documentos||[]).length} documento(s)`,null]},[title,subtitle,filePath]=definitions[entity];return{entity,table,id:row.id,companyId:entity==='company'?row.id:row.empresa_id,title,subtitle,filePath,deletedAt:row.excluido_em,raw:row}}
async function loadData(){
  const requests=[activeRows('empresas','razao_social'),activeRows('certidoes','validade'),activeRows('balancos','exercicio',false),activeRows('licitacoes','abertura'),activeRows('pacotes','criado_em',false),activeRows('documentos_empresa','criado_em',false)];
  requests.push(client.from('licitacao_checklist_itens').select('*').order('ordem'),
    client.from('agenda_tarefas').select('*').order('prazo'),
    client.from('parametros_legais').select('*'));
  if(isAdmin())requests.push(client.from('perfis').select('*').order('email'));
  const results=await Promise.all(requests),failure=[results[0],results[1],results[3],results[9]].find(r=>r?.error);
  if(failure){toast(friendlyError(failure.error));return}
  state.companies=(results[0].data||[]).map(x=>({id:x.id,name:x.razao_social,trade:x.nome_fantasia,cnpj:x.cnpj,city:x.municipio,state:x.uf,activities:x.atividades,openingDate:x.data_abertura,legalNature:x.natureza_juridica,size:x.porte}));
  state.certificates=(results[1].data||[]).map(x=>({id:x.id,companyId:x.empresa_id,type:x.tipo,tipoChave:x.tipo_chave,issuer:x.orgao_emissor,issued:x.emissao,validity:x.validade,link:x.link_emissao,filePath:x.arquivo_path,responsavelTecnico:x.responsavel_tecnico,arquivado:!!x.arquivado}));
  state.balances=(results[2].data||[]).map(x=>({id:x.id,companyId:x.empresa_id,year:x.exercicio,tipoChave:x.tipo_chave,documentType:x.tipo_documento,periodStart:x.periodo_inicio,periodEnd:x.periodo_fim,registrationDate:x.data_registro,registrationOffice:x.orgao_registro,filePath:x.arquivo_path,notes:x.observacoes}));
  state.notices=(results[3].data||[]).map(x=>({id:x.id,companyId:x.empresa_id,number:x.numero,agency:x.orgao,object:x.objeto,opening:x.abertura,horaSessao:x.hora_sessao,modality:x.modalidade,linkPortal:x.link_portal,requirements:x.requisitos||[],proposalRequirements:x.requisitos_proposta||[],declarations:x.declaracoes||[],items:x.itens||[],filePath:x.edital_path,extractedText:x.texto_extraido,temCertame:x.tem_certame!==false,modalidadePadrao:x.modalidade_padrao,formaDireta:x.forma_contratacao_direta,fundamentoLegal:x.fundamento_legal,tipoObjeto:x.tipo_objeto,criterio:x.criterio_julgamento,modoDisputa:x.modo_disputa,regime:x.regime_execucao,meEpp:x.exclusividade_me_epp||'nao',valorEstimado:x.valor_estimado,procedimentoAuxiliar:x.procedimento_auxiliar,statusProcesso:x.status_processo||'rascunho',interesse:x.interesse||'em_analise',prioridade:x.prioridade||'media',responsavel:x.responsavel,anotacoes:x.anotacoes,decidirAte:x.decidir_ate}));
  state.packages=(results[4].data||[]).map(x=>({id:x.id,companyId:x.empresa_id,noticeId:x.licitacao_id,name:x.nome,status:x.status,documents:x.documentos||[],proposal:x.proposta||{},declarations:x.declaracoes||[],items:x.itens||[],createdAt:x.criado_em}));
  state.documents=(results[5]?.data||[]).map(x=>({id:x.id,companyId:x.empresa_id,category:x.categoria,type:x.tipo,tipoChave:x.tipo_chave,name:x.nome_original,filePath:x.arquivo_path,source:x.origem,sourceFolder:x.pasta_origem,documentDate:x.data_documento,validity:x.validade,hash:x.sha256,metadata:x.metadados||{},createdAt:x.criado_em,responsavelTecnico:x.responsavel_tecnico,arquivado:!!x.arquivado,socios:x.socios||[]}));
  const activeCompanyIds=new Set(state.companies.map(company=>company.id));
  state.certificates=state.certificates.filter(item=>activeCompanyIds.has(item.companyId));state.balances=state.balances.filter(item=>activeCompanyIds.has(item.companyId));state.notices=state.notices.filter(item=>activeCompanyIds.has(item.companyId));state.packages=state.packages.filter(item=>activeCompanyIds.has(item.companyId));state.documents=state.documents.filter(item=>activeCompanyIds.has(item.companyId));
  const activeNoticeIds=new Set(state.notices.map(n=>n.id));
  state.checklist=(results[6]?.data||[]).filter(x=>activeNoticeIds.has(x.licitacao_id)).map(x=>({id:x.id,companyId:x.empresa_id,noticeId:x.licitacao_id,chave:x.chave,bloco:x.bloco,titulo:x.titulo,baseLegal:x.base_legal,ordem:x.ordem,obrigatorio:x.obrigatorio,aplicavel:x.aplicavel,justificativa:x.justificativa_nao_aplicavel,documentoRefTabela:x.documento_ref_tabela,documentoRefId:x.documento_ref_id,documentoRefPath:x.documento_ref_path,validade:x.validade,status:x.status,observacao:x.observacao,documentosVinculados:x.documentos_vinculados||[]}));
  state.agenda=(results[7]?.data||[]).filter(x=>!x.licitacao_id||activeNoticeIds.has(x.licitacao_id)).map(x=>({id:x.id,companyId:x.empresa_id,noticeId:x.licitacao_id,checklistItemId:x.checklist_item_id,titulo:x.titulo,detalhe:x.detalhe,prazo:x.prazo,responsavel:x.responsavel,origem:x.origem,concluida:x.concluida,concluidaEm:x.concluida_em}));
  if(results[8]?.data?.length)Regras.definirParametros(Object.fromEntries(results[8].data.map(x=>[x.chave,Number(x.valor)])));
  state.profiles=(results[9]?.data||[]).map(x=>({id:x.id,email:x.email,name:x.nome,role:x.perfil,companyId:x.empresa_id}));
  if(results[6]?.error||results[7]?.error)toast('Execute supabase/atualizacao_wizard_licitacoes.sql para habilitar o assistente e a agenda.');
  const trashResults=await Promise.all([deletedRows('empresas'),deletedRows('certidoes'),deletedRows('documentos_empresa'),deletedRows('balancos'),deletedRows('licitacoes'),deletedRows('pacotes')]);
  const types=[['company','empresas'],['certificate','certidoes'],['document','documentos_empresa'],['balance','balancos'],['notice','licitacoes'],['package','pacotes']];
  state.trash=trashResults.flatMap((result,index)=>(result.data||[]).map(row=>trashItem(...types[index],row)));
  await purgeExpiredTrash();renderAll()
}
function navigate(view){$$('.view').forEach(v=>v.classList.toggle('active',v.id===view));$$('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$('#page-title').textContent=({dashboard:'Visão geral',companies:'Empresas',review:'Central por empresa',archive:'Acervo documental',certificates:'Certidões',balances:'Balanços patrimoniais',notices:'Editais','notice-detail':'Detalhes do edital',agenda:'Agenda de interesse',packages:'Pacotes de participação',trash:'Lixeira',access:'Acessos'})[view]||'LiciDoc'}
function renderMetrics(){const expired=state.certificates.filter(c=>status(c.validity)==='expired').length,urgent=state.certificates.filter(c=>status(c.validity)==='urgent').length;const hoje=new Date().toISOString().slice(0,10),tarefas=state.agenda.filter(t=>!t.concluida),atrasadas=tarefas.filter(t=>t.prazo&&t.prazo<hoje).length,participar=state.notices.filter(n=>n.interesse==='vamos_participar'&&(!n.opening||n.opening>=hoje)).length;$('#metrics').innerHTML=`<div class="metric"><span>Empresas</span><strong>${state.companies.length}</strong><small>Disponíveis para você</small></div><div class="metric red"><span>Certidões vencidas</span><strong>${expired}</strong><small>Exigem providência</small></div><div class="metric amber"><span>Vencem em até 15 dias</span><strong>${urgent}</strong><small>Atenção imediata</small></div><div class="metric${atrasadas?' red':''}"><span>Vamos participar</span><strong>${participar}</strong><small>${tarefas.length} providência(s), ${atrasadas} atrasada(s)</small></div>`}
function renderAlerts(){const items=[...state.certificates].sort((a,b)=>(a.validity||'9999').localeCompare(b.validity||'9999')).slice(0,6);$('#alerts').innerHTML=items.length?items.map(c=>{const st=status(c.validity),precisaAcao=st==='expired'||st==='urgent'||st==='missing';return`<div class="list-row"><p><strong>${esc(c.type)}</strong><br><small>${esc(companyName(c.companyId))} · ${fmt(c.validity)}</small></p>${precisaAcao?`<button type="button" class="badge-acao badge ${st}" data-adicionar-regularidade="${esc(chaveAtualDe('certificate',c))}" data-adicionar-empresa="${esc(c.companyId)}" title="Cadastrar a certidão atualizada">${statusLabel(st)}</button>`:`<span class="badge ${st}">${statusLabel(st)}</span>`}</div>`}).join(''):'<div class="empty">Nenhuma certidão cadastrada.</div>'}
function renderUpcoming(){const items=[...state.notices].filter(n=>!n.opening||new Date(`${n.opening}T23:59:59`)>=new Date()).sort((a,b)=>(a.opening||'9999').localeCompare(b.opening||'9999')).slice(0,5);$('#upcoming').innerHTML=items.length?items.map(n=>{const itens=state.checklist.filter(c=>c.noticeId===n.id&&c.aplicavel!==false),r=window.Regras?Regras.contar(itens):{criticos:0,total:0};return`<div class="list-row"><p><strong>${esc(n.number)}</strong><br><small>${esc(n.agency)} · ${r.total?`${r.prontos}/${r.total} documentos prontos`:'checklist ainda não calculado'}</small></p><span>${fmt(n.opening)}${r.criticos?`<br><small class="pend">${r.criticos} pendência(s)</small>`:''}</span></div>`}).join(''):'<div class="empty">Nenhuma licitação futura cadastrada.</div>'}
/* ---------------------------------------------------------------------------
   Acervo unificado: certidões, balanços e documentos gerais são a mesma coisa
   para quem pergunta "o que está em dia nesta empresa?". Reúne as três tabelas
   numa lista só, cada linha com a chave do catálogo que decide sua vigência.
--------------------------------------------------------------------------- */
function acervoDaEmpresa(companyId){
  const chaveDe=(registro,fallback)=>registro.tipoChave||Regras.classificarNoCatalogo(fallback);
  const docs=state.documents.filter(d=>d.companyId===companyId).map(d=>({
    origem:'documentos_empresa',id:d.id,chave:chaveDe(d,{categoria:d.category,tipo:d.type,nome:d.name}),
    rotulo:d.type||d.name,arquivo:d.name,path:d.filePath,data:d.documentDate||(d.createdAt||'').slice(0,10),
    validade:d.validity||null,categoriaAntiga:d.category,fonte:d.source,responsavel:d.responsavelTecnico||null,arquivado:!!d.arquivado,socios:d.socios||[]}));
  const certs=state.certificates.filter(c=>c.companyId===companyId).map(c=>({
    origem:'certidoes',id:c.id,chave:chaveDe(c,{categoria:'Certidões',tipo:c.type,nome:c.type}),
    rotulo:c.type,arquivo:c.type,path:c.filePath,data:c.issued||null,validade:c.validity||null,
    categoriaAntiga:'Certidões',fonte:c.issuer,link:c.link,responsavel:c.responsavelTecnico||null,arquivado:!!c.arquivado}));
  const bals=state.balances.filter(b=>b.companyId===companyId).map(b=>({
    origem:'balancos',id:b.id,chave:b.tipoChave||'balanco',
    rotulo:`Balanço ${b.year}`,arquivo:b.documentType||'Balanço anual',path:b.filePath,
    data:b.periodEnd||`${b.year}-12-31`,validade:null,categoriaAntiga:'Balanços',fonte:b.registrationOffice}));
  return [...certs,...bals,...docs];
}

const prontidaoDe=(companyId,dataAlvo)=>Regras.prontidaoDaEmpresa(acervoDaEmpresa(companyId),dataAlvo);

/* Painel do veredito: a resposta objetiva de "posso disputar hoje?" — ou, com
   dataAlvo, "vou poder disputar naquele dia?", pois o motor de vigência aceita
   qualquer data de referência, não só hoje. */
function painelProntidao(company,{compacto=false,dataAlvo}={}){
  const p=prontidaoDe(company.id,dataAlvo);
  const cor={apto:'ok',apto_com_ressalva:'pendente',nao_apto:'vencido'}[p.status];
  const problema=(lista,rotulo,classe)=>lista.length?`<div class="pront-linha">
    <span class="badge ${classe}">${rotulo}</span>
    <span>${lista.map(x=>esc(x.tipo?x.tipo.nome:x.nome)).join(' · ')}</span></div>`:'';
  const projetado=dataAlvo&&dataAlvo!==Regras.hojeIso();
  return `<div class="prontidao ${p.status}">
    <div class="pront-head">
      <div><span class="badge ${cor}">${esc(Regras.ROTULO_PRONTIDAO[p.status])}</span>
        ${compacto?'':`<strong>${esc(company.name)}</strong>`}
        ${projetado?`<small class="pront-projetada">projetado para ${fmt(dataAlvo)}, não para hoje</small>`:''}</div>
      <span class="pront-num">${p.prontos}/${p.base}<small>base documental</small></span>
    </div>
    <div class="ag-barra"><div class="ag-barra-fill${p.percentual>=100?' full':p.percentual>=60?' meio':''}" style="width:${p.percentual}%"></div></div>
    ${problema(p.faltando,'Falta','ausente')}
    ${problema(p.vencidos,projetado?'Vai estar vencido':'Vencido','vencido')}
    ${problema(p.vencendo,`Vence em até ${Regras.DIAS_VENCE_LOGO} dias`,'pendente')}
    ${p.status==='apto'?`<p class="pront-ok">Base documental completa e em dia${projetado?` para ${fmt(dataAlvo)}`:''}. Confira sempre as exigências específicas do edital.</p>`:''}
  </div>`;
}

/* Regularidade do dia: as certidões fiscais que praticamente todo edital pede,
   uma linha por tipo, com a validade da vigente ou "Vencida"/"Ausente" e um
   atalho pra mandar a atualizada na hora — sem precisar ir até o Acervo. */
function regularidadeDoDia(company){
  const vigencias=Regras.acervoVigente(acervoDaEmpresa(company.id));
  const porChave=new Map(vigencias.map(v=>[v.chave,v]));
  const tipos=Regras.catalogoDocumentos.filter(t=>t.bloco==='fiscal_trabalhista'&&t.base);
  return `<div class="regularidade-dia">${tipos.map(t=>{
    const v=porChave.get(t.chave),d=v?.vigente,situacao=v?.situacao||'ausente';
    const rotulo=situacao==='ausente'?'Ausente':situacao==='vencido'?'Vencida':situacao==='vence_logo'?`Vence em breve · ${fmt(d.validade)}`:`Válida até ${fmt(d.validade)}`;
    const precisaAcao=situacao==='ausente'||situacao==='vencido';
    return `<div class="regularidade-linha">
      <span>${esc(t.nome)}</span>
      <span class="badge ${SIT_CLASSE[situacao]}">${esc(rotulo)}</span>
      ${precisaAcao?`<button type="button" class="link" data-adicionar-regularidade="${t.chave}" data-adicionar-empresa="${company.id}">Adicionar atualizada</button>`:'<span></span>'}
    </div>`;
  }).join('')}</div>`;
}

const archiveCategories=['Certidões','Balanços','Societários','Atestados técnicos','Licenças e alvarás','Representação','Declarações','Propostas','Editais e processos','Identificação','Dados bancários','Outros'];
const STATUS_PROCESSO={rascunho:'Rascunho',em_conferencia:'Em conferência',pronto:'Pronto',enviado:'Enviado',arquivado:'Arquivado'};
function classificacaoLabel(n){if(!window.Regras)return n.modality||'';const partes=[];if(n.temCertame===false)partes.push(Regras.rotulo(Regras.formasDiretas,n.formaDireta)||'Contratação direta');else if(n.modalidadePadrao)partes.push(Regras.rotulo(Regras.modalidades,n.modalidadePadrao));if(n.fundamentoLegal)partes.push(n.fundamentoLegal);if(n.tipoObjeto)partes.push(Regras.rotulo(Regras.tiposObjeto,n.tipoObjeto));if(n.valorEstimado)partes.push(Regras.moeda(n.valorEstimado));return partes.join(' · ')||n.modality||'Classificação pendente'}
function renderAccess(){if(!isAdmin())return;$('#access-list').innerHTML=state.profiles.length?state.profiles.map(p=>`<div class="access-row"><p><strong>${esc(p.name||p.email)}</strong><br><small>${esc(p.email)} · ${p.role==='admin_geral'?'Administrador geral':p.role==='proprietario_empresa'?'Proprietário':'Aguardando liberação'}</small></p><label>Empresa<select data-access-company="${p.id}" ${p.role==='admin_geral'?'disabled':''}><option value="">Selecione</option>${state.companies.map(c=>`<option value="${c.id}" ${c.id===p.companyId?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><button class="primary" data-authorize="${p.id}" ${p.role==='admin_geral'?'disabled':''}>Autorizar</button></div>`).join(''):'<div class="empty">Nenhum usuário cadastrado.</div>'}

function deleteButton(entity,recordId,label='Mover para a lixeira'){return`<button class="link danger-text" type="button" data-trash-entity="${entity}" data-trash-id="${recordId}">${label}</button>`}
function renderCompanyDashboard(){const selected=$('#dashboard-company')?.value||'',companies=selected?state.companies.filter(c=>c.id===selected):state.companies;$('#company-dashboard').innerHTML=companies.length?companies.map(company=>{const p=prontidaoDe(company.id),cor={apto:'ok',apto_com_ressalva:'pendente',nao_apto:'vencido'}[p.status];return`<article class="company-summary-card"><div class="card-head"><div><h3>${esc(company.name)}</h3><small>${esc(company.cnpj)}</small></div><div class="card-head-acoes"><span class="badge ${cor}">${esc(Regras.ROTULO_PRONTIDAO[p.status])}</span><button class="secondary" data-review-company="${company.id}">Revisar empresa</button></div></div>${regularidadeDoDia(company)}</article>`}).join(''):'<div class="empty">Nenhuma empresa disponível.</div>'}
function renderCompanies(){const q=$('#company-search')?.value.toLowerCase()||'',list=state.companies.filter(c=>(c.name+c.cnpj).toLowerCase().includes(q));$('#company-list').innerHTML=list.length?list.map(c=>{const certs=state.certificates.filter(x=>x.companyId===c.id),bad=certs.filter(x=>status(x.validity)!=='ok').length;return`<article class="card company-card"><div class="card-head"><div><h3>${esc(c.name)}</h3><div class="meta">${esc(c.trade||'Sem nome fantasia')} · ${esc(c.cnpj)}</div></div><button class="secondary" data-review-company="${c.id}">Revisar</button></div><p>${esc(c.city||'Município não informado')} ${c.state?'— '+esc(c.state):''}</p><div class="stats"><span><strong>${certs.length}</strong>certidões</span><span><strong>${bad}</strong>pendências</span></div>${isAdmin()?`<div class="record-actions">${deleteButton('company',c.id)}</div>`:''}</article>`}).join(''):'<div class="empty">Nenhuma empresa encontrada.</div>';renderSelects()}
function reviewRows(items,empty){return items.length?items.join(''):`<p class="empty">${empty}</p>`}
function renderCompanyReview(){const root=$('#review-content'),companyId=$('#review-company')?.value||'';if(!companyId){root.innerHTML='<div class="empty">Selecione uma empresa para revisar todo o conjunto documental.</div>';return}const company=state.companies.find(c=>c.id===companyId);if(!company){root.innerHTML='<div class="empty">Empresa não localizada.</div>';return}const certs=[...state.certificates.filter(x=>x.companyId===companyId)].sort((a,b)=>(a.validity||'9999').localeCompare(b.validity||'9999')),docs=state.documents.filter(x=>x.companyId===companyId),balances=state.balances.filter(x=>x.companyId===companyId),notices=state.notices.filter(x=>x.companyId===companyId),packages=state.packages.filter(x=>x.companyId===companyId),pending=certs.filter(x=>status(x.validity)!=='ok').length;root.innerHTML=`${painelProntidao(company)}<div class="review-hero card"><div><span class="eyebrow">EMPRESA SELECIONADA</span><h2>${esc(company.name)}</h2><p>${esc(company.cnpj)} · ${esc(company.city||'Município não informado')}${company.state?' / '+esc(company.state):''}</p></div><div class="summary-numbers"><span><strong>${docs.length}</strong>Documentos</span><span><strong>${certs.length}</strong>Certidões</span><span class="${pending?'red-text':''}"><strong>${pending}</strong>Pendências</span><span><strong>${notices.length}</strong>Editais</span></div></div><div class="review-sections"><article class="card review-section"><h3>Certidões</h3>${reviewRows(certs.map(c=>`<div class="review-row"><span><strong>${esc(c.type)}</strong><small>${esc(c.issuer||'Órgão não informado')} · validade ${fmt(c.validity)}</small></span><span><span class="badge ${status(c.validity)}">${statusLabel(status(c.validity))}</span>${c.filePath?`<button class="link" data-document="${esc(c.filePath)}">Abrir</button>`:''}${deleteButton('certificate',c.id)}</span></div>`),'Nenhuma certidão cadastrada.')}</article><article class="card review-section"><h3>Acervo documental</h3>${reviewRows(docs.slice(0,20).map(d=>`<div class="review-row"><span><strong>${esc(d.type||d.name)}</strong><small>${esc(d.category)} · ${fmt(d.documentDate)}</small></span><span>${d.filePath?`<button class="link" data-document="${esc(d.filePath)}">Abrir</button>`:''}${deleteButton('document',d.id)}</span></div>`),'Nenhum documento arquivado.')}</article><article class="card review-section"><h3>Balanços patrimoniais</h3>${reviewRows(balances.map(b=>`<div class="review-row"><span><strong>Exercício ${esc(b.year)}</strong><small>${esc(b.documentType||'Balanço anual')}</small></span><span>${b.filePath?`<button class="link" data-document="${esc(b.filePath)}">Abrir</button>`:''}${deleteButton('balance',b.id)}</span></div>`),'Nenhum balanço arquivado.')}</article><article class="card review-section"><h3>Editais e processos</h3>${reviewRows(notices.map(n=>`<div class="review-row"><span><strong>${esc(n.number)}</strong><small>${esc(n.agency)} · abertura ${fmt(n.opening)}</small></span><span><button class="link" data-notice-detail="${n.id}">Ver tela</button>${deleteButton('notice',n.id)}</span></div>`),'Nenhum edital cadastrado.')}</article><article class="card review-section"><h3>Pacotes preparados</h3>${reviewRows(packages.map(p=>`<div class="review-row"><span><strong>${esc(p.name)}</strong><small>${p.documents.length} documento(s)</small></span><span><button class="link" data-download-package="${p.id}">Baixar</button>${deleteButton('package',p.id)}</span></div>`),'Nenhum pacote preparado.')}</article></div>`}
const SIT_ACERVO={vigente:'Vigente',vence_logo:'Vence em breve',vencido:'Vencido',sem_validade:'Em dia',ausente:'Ausente'};
const SIT_CLASSE={vigente:'ok',vence_logo:'pendente',vencido:'vencido',sem_validade:'ok',ausente:'ausente'};

/* O acervo deixa de ser uma pilha de arquivos e passa a ser uma lista de tipos:
   um por linha, com o que vale hoje em destaque e o histórico recolhido. */
function renderArchive(){
  const root=$('#archive-list');
  if(!root)return;
  const companyId=$('#archive-view-company')?.value||'';
  const situacao=$('#archive-filter')?.value||'all';
  if($('#archive-view-company')&&!$('#archive-view-company').dataset.pronto){
    $('#archive-view-company').dataset.pronto='1';
  }
  if(!companyId){
    root.innerHTML='<div class="empty">Selecione uma empresa para ver o acervo organizado por tipo de documento.</div>';
    if($('#archive-count'))$('#archive-count').textContent='';
    if($('#archive-prontidao'))$('#archive-prontidao').innerHTML='';
    return;
  }
  const company=state.companies.find(c=>c.id===companyId);
  const vigencias=Regras.acervoVigente(acervoDaEmpresa(companyId));
  if($('#archive-prontidao'))$('#archive-prontidao').innerHTML=company?painelProntidao(company,{compacto:true}):'';

  // O Acervo é o checklist inteiro do catálogo, não só o que já tem arquivo:
  // todo tipo sem nenhum documento aparece como ausente, com um jeito de
  // vincular um arquivo já enviado (mal classificado) ou cadastrar um novo —
  // senão não dá pra ver "Declaração" antes de existir alguma já classificada
  // assim. "Documento não classificado" fica de fora: não é um tipo exigível,
  // é só onde cai o que ainda não foi revisado.
  const presentes=new Set(vigencias.map(v=>v.chave));
  const ausentes=Regras.catalogoDocumentos.filter(t=>t.chave!=='outros'&&!presentes.has(t.chave))
    .map(t=>({chave:t.chave,tipo:t,vigente:null,anteriores:[],total:0,situacao:'ausente',acumulativo:false}));
  const todos=[...vigencias,...ausentes]
    .filter(v=>situacao==='all'||v.situacao===situacao);

  const porBloco=new Map();
  todos.forEach(v=>{
    const b=v.tipo.bloco;
    if(!porBloco.has(b))porBloco.set(b,[]);
    porBloco.get(b).push(v);
  });
  if($('#archive-count'))
    $('#archive-count').textContent=`${todos.length} tipo(s) · ${vigencias.reduce((n,v)=>n+v.total,0)} arquivo(s)`;

  root.innerHTML=todos.length?[...porBloco.entries()].map(([bloco,itens])=>`
    <section class="acervo-bloco">
      <h3>${esc(Regras.blocos[bloco]?.n||bloco)}<span>${esc(Regras.blocos[bloco]?.base||'')}</span></h3>
      ${itens.map(v=>linhaDoAcervo(v,companyId)).join('')}
    </section>`).join(''):'<div class="empty">Nenhum documento nesta situação.</div>';

  if(vincularAberto&&vincularSelecionado){
    const [origem,id]=vincularSelecionado.split(':');
    const registro=registrosParaRevisao().find(r=>r.origem===origem&&r.id===id);
    if(registro)visualizarArquivo(registro.path,$('#visualizador-vincular'));
  }
}

/* ---------------------------------------------------------------------------
   Vincular arquivo já enviado.

   Em vez de só editar um documento de cada vez, aqui se parte do TIPO exigido
   (a linha do Acervo) e escolhe, numa lista travada dos arquivos já
   cadastrados na empresa, qual deles é aquele tipo — com pré-visualização
   antes de confirmar. É a via inversa da revisão guiada, útil quando se sabe
   o que falta e se suspeita que o arquivo já está em algum lugar, só
   classificado errado (a "Declaração entrando como Ato Constitutivo").
--------------------------------------------------------------------------- */
let vincularAberto=null; // chave do tipo com o seletor de vínculo aberto na tela
let vincularSelecionado=null; // `${origem}:${id}` do candidato escolhido, em pré-visualização

function painelVincular(v,companyId){
  if(vincularAberto!==v.chave)return'';
  const candidatos=registrosParaRevisao().filter(r=>r.companyId===companyId)
    .sort((a,b)=>a.rotulo.localeCompare(b.rotulo,'pt-BR'));
  const opcoes=candidatos.map(r=>{
    const chaveMapa=`${r.origem}:${r.id}`;
    // O rótulo pode estar errado (é exatamente o problema que esta tela
    // resolve); o detalhe costuma trazer o nome do arquivo original, que é
    // o jeito confiável de reconhecer qual arquivo é qual.
    return `<option value="${esc(chaveMapa)}"${vincularSelecionado===chaveMapa?' selected':''}>${esc(r.rotulo)}${r.detalhe?` (${esc(r.detalhe)})`:''} — hoje: ${esc(Regras.tipoDocumento(r.chave).nome)}</option>`;
  }).join('');
  return `<div class="acervo-vincular">
    <label>Vincular um arquivo já enviado a "${esc(v.tipo.nome)}"
      <select data-vincular-select>
        <option value="">Selecione entre os já enviados...</option>
        ${opcoes}
      </select>
    </label>
    <div id="visualizador-vincular" class="visualizador">${vincularSelecionado?'':'<p class="empty">Escolha um arquivo para pré-visualizar antes de confirmar.</p>'}</div>
    <div class="acervo-vincular-acoes">
      <button type="button" class="link" data-vincular-novo="${esc(v.chave)}">Nenhum destes — cadastrar um arquivo novo</button>
      <span class="acervo-vincular-botoes">
        <button type="button" class="secondary" data-vincular-cancelar>Cancelar</button>
        <button type="button" class="primary" data-vincular-confirmar="${esc(v.chave)}" ${vincularSelecionado?'':'disabled'}>Vincular este arquivo</button>
      </span>
    </div>
  </div>`;
}
async function confirmarVinculo(chaveTipo){
  if(!vincularSelecionado)return;
  const [origem,id]=vincularSelecionado.split(':');
  const {error}=await client.from(origem).update({tipo_chave:chaveTipo}).eq('id',id);
  if(error){toast(friendlyError(error));return}
  vincularAberto=null;vincularSelecionado=null;
  await loadData();
  renderArchive();
  toast('Documento vinculado a este tipo.');
}
/* Arquivamento manual dentro de um tipo acumulativo: tira um arquivo da
   disputa por "vigente" sem apagá-lo — o usuário decide quem representa o
   grupo hoje, não a data mais recente. */
async function alternarArquivado(chaveRegistro,valor){
  const [origem,id]=chaveRegistro.split(':');
  const {error}=await client.from(origem).update({arquivado:valor}).eq('id',id);
  if(error){toast(friendlyError(error));return}
  await loadData();
  renderArchive();
  toast(valor?'Arquivado — não conta mais como vigente.':'Reativado.');
}

function linhaDoAcervo(v,companyId){
  const d=v.vigente;
  const regra={validade:'vale até a validade',substituivel:'o mais recente substitui os anteriores',acumulativo:'todos somam'}[v.tipo.vigencia];
  return `<article class="acervo-item ${v.situacao}">
    <div class="acervo-item-main">
      <strong>${esc(v.tipo.nome)}${v.tipo.base?'<span class="tag-base" title="Exigido em praticamente todo edital">base</span>':''}</strong>
      ${d?`<small>${esc(d.rotulo)}${d.validade?` · válido até ${fmt(d.validade)}`:d.data?` · ${fmt(d.data)}`:''}${d.fonte?` · ${esc(d.fonte)}`:''}${d.responsavel?` · ${esc(d.responsavel)}`:''}</small>`
        :'<small>Nenhum arquivo deste tipo no acervo.</small>'}
      <small class="acervo-regra">${esc(regra)}${v.total>1?` · ${v.total} arquivo(s)`:''}</small>
      ${v.chave==='ato_constitutivo'&&d?.socios?.length?`<div class="acervo-socios">
        <strong>Sócios</strong>
        <ul>${d.socios.map(s=>`<li>${esc(s.nome)}${s.path?` <button type="button" class="link" data-document="${esc(s.path)}">Abrir documento</button>`:' <em>sem documento anexado</em>'}</li>`).join('')}</ul>
      </div>`:''}
    </div>
    <div class="acervo-item-acoes">
      ${d?.path?`<button class="link" data-document="${esc(d.path)}">Abrir</button>`:''}
      ${d?`<button class="link" data-editar="${({documentos_empresa:'document',certidoes:'certificate',balancos:'balance'})[d.origem]}" data-editar-id="${d.id}">Editar</button>`:''}
      <button type="button" class="link" data-vincular="${esc(v.chave)}">${vincularAberto===v.chave?'Fechar vínculo':'Vincular arquivo já enviado'}</button>
      ${d&&v.acumulativo?`<button type="button" class="link" data-arquivar="${d.origem}:${d.id}" data-arquivar-valor="true">Arquivar</button>`:''}
      ${d?.link?`<a class="link" href="${esc(d.link)}" target="_blank" rel="noopener">Emitir nova ↗</a>`:''}
      ${d&&d.origem==='documentos_empresa'?deleteButton('document',d.id,'Excluir'):''}
      ${d&&d.origem==='certidoes'?deleteButton('certificate',d.id,'Excluir'):''}
      ${d&&d.origem==='balancos'?deleteButton('balance',d.id,'Excluir'):''}
    </div>
    <span class="badge ${SIT_CLASSE[v.situacao]}">${SIT_ACERVO[v.situacao]}</span>
    ${painelVincular(v,companyId)}
    ${v.anteriores.length?`<details class="acervo-versoes">
      <summary>${v.acumulativo?`Outros ${v.anteriores.length} arquivo(s) deste tipo`:`${v.anteriores.length} versão(ões) anterior(es)`}</summary>
      ${v.anteriores.map(a=>`<div class="acervo-versao">
        <span>${esc(a.rotulo)}${a.arquivado?' <em>(arquivado)</em>':''}<small>${a.validade?`validade ${fmt(a.validade)}`:a.data?fmt(a.data):'sem data'}${a.arquivo&&a.arquivo!==a.rotulo?` · ${esc(a.arquivo)}`:''}${a.responsavel?` · ${esc(a.responsavel)}`:''}</small></span>
        <span>${a.path?`<button class="link" data-document="${esc(a.path)}">Abrir</button>`:''}
        <button class="link" data-editar="${({documentos_empresa:'document',certidoes:'certificate',balancos:'balance'})[a.origem]}" data-editar-id="${a.id}">Editar</button>
        ${v.acumulativo?`<button type="button" class="link" data-arquivar="${a.origem}:${a.id}" data-arquivar-valor="${a.arquivado?'false':'true'}">${a.arquivado?'Reativar':'Arquivar'}</button>`:''}</span>
      </div>`).join('')}
    </details>`:''}
  </article>`;
}

/* Reclassifica o que já está arquivado no catálogo. É o "arrumar a casa" para
   quem importou pastas do Dropbox antes de existir critério. */
async function organizarAcervo(){
  const botao=$('#organizar-acervo');
  const alvos=state.documents.filter(d=>!d.tipoChave);
  const certs=state.certificates.filter(c=>!c.tipoChave);
  const bals=state.balances.filter(b=>!b.tipoChave);
  if(!alvos.length&&!certs.length&&!bals.length){toast('O acervo já está classificado.');return}
  setBusy(botao,true,'Organizando...');
  let n=0;
  try{
    for(const d of alvos){
      const chave=Regras.classificarNoCatalogo({categoria:d.category,tipo:d.type,nome:d.name});
      const {error}=await client.from('documentos_empresa').update({tipo_chave:chave}).eq('id',d.id);
      if(error)throw error;
      n++;
    }
    for(const c of certs){
      const chave=Regras.classificarNoCatalogo({categoria:'Certidões',tipo:c.type,nome:c.type});
      const {error}=await client.from('certidoes').update({tipo_chave:chave}).eq('id',c.id);
      if(error)throw error;
      n++;
    }
    for(const b of bals){
      const {error}=await client.from('balancos').update({tipo_chave:'balanco'}).eq('id',b.id);
      if(error)throw error;
      n++;
    }
    await loadData();
    toast(`${n} documento(s) classificado(s) no catálogo.`);
  }catch(error){toast(friendlyError(error))}
  finally{setBusy(botao,false)}
}

/* ---------------------------------------------------------------------------
   Revisão de classificação em lote.

   O modal de edição resolve uma certidão de cada vez; quem tem dezenas erradas
   ou não reconhecidas precisa de outra coisa. Esta tela lista certidões e
   documentos do acervo (todas as empresas, ou uma só) numa tabela com o tipo do
   catálogo e a validade direto na linha, acumula as mudanças em memória e só
   grava quando o usuário manda salvar — nada é gravado tecla a tecla.
--------------------------------------------------------------------------- */
let loteEdicoes=new Map(); // `${origem}:${id}` -> {tipoChave?, validade?}

function registrosParaRevisao(){
  const certs=state.certificates.map(c=>({origem:'certidoes',id:c.id,companyId:c.companyId,
    rotulo:c.type,detalhe:[c.issuer,c.responsavelTecnico].filter(Boolean).join(' · '),path:c.filePath,chave:chaveAtualDe('certificate',c),validade:c.validity||''}));
  const docs=state.documents.map(d=>({origem:'documentos_empresa',id:d.id,companyId:d.companyId,
    rotulo:d.type||d.name,detalhe:[d.name!==(d.type||d.name)?d.name:(d.category||''),d.responsavelTecnico].filter(Boolean).join(' · '),path:d.filePath,
    chave:chaveAtualDe('document',d),validade:d.validity||''}));
  return [...certs,...docs];
}
function valorAtualDoCampo(reg,campo){
  const edicao=loteEdicoes.get(`${reg.origem}:${reg.id}`);
  if(edicao&&campo in edicao)return edicao[campo];
  return campo==='tipoChave'?reg.chave:reg.validade;
}
function renderRevisaoLote(){
  const raiz=$('#revisao-lote-linhas');
  if(!raiz)return;
  const empresaId=$('#revisao-lote-empresa')?.value||'';
  const mostrar=$('#revisao-lote-mostrar')?.value||'nao_reconhecidos';
  const busca=($('#revisao-lote-busca')?.value||'').toLowerCase().trim();
  let registros=registrosParaRevisao();
  if(empresaId)registros=registros.filter(r=>r.companyId===empresaId);
  // A decisão de entrar na lista usa a chave ORIGINAL, não a editada: senão a
  // linha desaparece assim que o usuário corrige o tipo, antes de dar tempo de
  // ver a própria correção ou de salvar. Ela só some depois que loadData()
  // trouxer o valor novo do banco.
  if(mostrar==='nao_reconhecidos')registros=registros.filter(r=>r.chave==='outros'||loteEdicoes.has(`${r.origem}:${r.id}`));
  if(busca)registros=registros.filter(r=>`${r.rotulo} ${r.detalhe}`.toLowerCase().includes(busca));
  registros.sort((a,b)=>companyName(a.companyId).localeCompare(companyName(b.companyId),'pt-BR')||a.rotulo.localeCompare(b.rotulo,'pt-BR'));

  $('#revisao-lote-meta').innerHTML=`<span class="wz-chip">${registros.length} registro(s)</span>${loteEdicoes.size?`<span class="wz-chip warn"><b>${loteEdicoes.size}</b> alteração(ões) pendente(s)</span>`:''}`;

  raiz.innerHTML=registros.length?registros.map(r=>{
    const chaveAtual=valorAtualDoCampo(r,'tipoChave'),validade=valorAtualDoCampo(r,'validade');
    const situacao=Regras.situacaoDoDocumento({validade},Regras.hojeIso());
    const alterado=loteEdicoes.has(`${r.origem}:${r.id}`);
    return `<tr data-origem="${r.origem}" data-id="${r.id}"${alterado?' class="lote-alterado"':''}>
      <td>${esc(companyName(r.companyId))}</td>
      <td><strong>${esc(r.rotulo)}</strong>${r.detalhe?`<br><small>${esc(r.detalhe)}</small>`:''}${r.path?`<br><button type="button" class="link" data-document="${esc(r.path)}">Abrir arquivo</button>`:''}</td>
      <td><select data-lote-campo="tipoChave">${opcoesCatalogo(chaveAtual)}</select></td>
      <td><input type="date" data-lote-campo="validade" value="${esc(validade)}"></td>
      <td><span class="badge ${SIT_CLASSE[situacao]}">${SIT_ACERVO[situacao]}</span></td>
    </tr>`;
  }).join(''):'<tr><td colspan="5" class="empty">Nenhum registro nesta situação.</td></tr>';
}
function abrirRevisaoLote(){
  loteEdicoes=new Map();
  $('#revisao-lote-empresa').innerHTML='<option value="">Todas as empresas</option>'
    +state.companies.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  $('#revisao-lote-mostrar').value='nao_reconhecidos';
  $('#revisao-lote-busca').value='';
  renderRevisaoLote();
  $('#revisao-lote').showModal();
}
async function salvarRevisaoLote(){
  const botao=$('#revisao-lote-salvar');
  if(!loteEdicoes.size){toast('Nenhuma alteração para salvar.');return}
  for(const [chave,alteracoes] of loteEdicoes)
    if(chave.startsWith('certidoes:')&&'validade' in alteracoes&&!alteracoes.validade){
      toast('Uma certidão ficou sem validade. Preencha antes de salvar — o campo é obrigatório.');
      return;
    }
  setBusy(botao,true,'Salvando...');
  let n=0;
  try{
    for(const [chave,alteracoes] of loteEdicoes){
      const [origem,id]=chave.split(':'),payload={};
      if('tipoChave' in alteracoes)payload.tipo_chave=alteracoes.tipoChave;
      if('validade' in alteracoes)payload.validade=alteracoes.validade||null;
      const {error}=await client.from(origem).update(payload).eq('id',id);
      if(error)throw error;
      n++;
    }
    loteEdicoes=new Map();
    await loadData();
    renderRevisaoLote();
    toast(`${n} registro(s) atualizado(s).`);
  }catch(error){toast(friendlyError(error))}
  finally{setBusy(botao,false)}
}

/* ---------------------------------------------------------------------------
   Revisão documento por documento.

   A tabela em lote é rápida para quem já sabe o que corrigir; para conferir
   com calma — abrir o arquivo, olhar, decidir — um registro de cada vez é
   melhor. Mostra um por vez, com uma lista ao lado para pular direto para
   qualquer outro, e grava assim que o usuário confirma. Nenhum arquivo é
   perdido: só a classificação e a validade podem mudar.
--------------------------------------------------------------------------- */
let guiaIndice=0, guiaEdicao=null; // {tipoChave?, validade?} do registro em tela, só em memória até confirmar

function registrosGuiados(){
  const empresaId=$('#revisao-guiada-empresa')?.value||'';
  const mostrar=$('#revisao-guiada-mostrar')?.value||'todos';
  const busca=($('#revisao-guiada-busca')?.value||'').toLowerCase().trim();
  let registros=registrosParaRevisao();
  if(empresaId)registros=registros.filter(r=>r.companyId===empresaId);
  if(mostrar==='nao_reconhecidos')registros=registros.filter(r=>r.chave==='outros');
  if(busca)registros=registros.filter(r=>`${r.rotulo} ${r.detalhe}`.toLowerCase().includes(busca));
  registros.sort((a,b)=>{
    const nomeBloco=chave=>Regras.blocos[Regras.catalogoDocumentos.find(t=>t.chave===chave)?.bloco]?.n||'';
    return nomeBloco(a.chave).localeCompare(nomeBloco(b.chave),'pt-BR')||a.rotulo.localeCompare(b.rotulo,'pt-BR');
  });
  return registros;
}
function valorGuiaAtual(atual,campo){
  if(guiaEdicao&&campo in guiaEdicao)return guiaEdicao[campo];
  return campo==='tipoChave'?atual.chave:atual.validade;
}
function revisaoGuiadaSuja(){return guiaEdicao!==null}

function renderRevisaoGuiada(){
  const registros=registrosGuiados();
  if(guiaIndice>=registros.length)guiaIndice=Math.max(0,registros.length-1);
  const atual=registros[guiaIndice];

  $('#revisao-guiada-progresso').textContent=registros.length?`${guiaIndice+1} de ${registros.length}`:'0 de 0';
  $('#revisao-guiada-lista').innerHTML=registros.length?registros.map((r,i)=>{
    const situacao=Regras.situacaoDoDocumento({validade:r.validade},Regras.hojeIso());
    return `<button type="button" class="revisao-guiada-item${i===guiaIndice?' ativo':''}" data-guia-indice="${i}">
      <strong>${esc(r.rotulo)}</strong>
      <span class="badge ${SIT_CLASSE[situacao]}">${SIT_ACERVO[situacao]}</span>
    </button>`;
  }).join(''):'<p class="empty">Nenhum registro nesta situação.</p>';

  const raiz=$('#revisao-guiada-atual');
  const podeNavegar=registros.length>0;
  $('#revisao-guiada-confirmar').disabled=!podeNavegar;
  $('#revisao-guiada-anterior').disabled=!podeNavegar||guiaIndice<=0;
  $('#revisao-guiada-pular').disabled=!podeNavegar||guiaIndice>=registros.length-1;
  raiz.dataset.registro=atual?`${atual.origem}:${atual.id}`:'';
  if(!atual){
    raiz.innerHTML='<div class="empty">Nenhum documento para revisar com este filtro.</div>';
    return;
  }
  const chave=valorGuiaAtual(atual,'tipoChave'),validade=valorGuiaAtual(atual,'validade');
  const situacao=Regras.situacaoDoDocumento({validade},Regras.hojeIso());
  raiz.innerHTML=`
    <p class="revisao-guiada-empresa">${esc(companyName(atual.companyId))}</p>
    <h3>${esc(atual.rotulo)}</h3>
    ${atual.detalhe?`<p class="revisao-guiada-detalhe">${esc(atual.detalhe)}</p>`:''}
    ${atual.path?`<button type="button" class="secondary" data-document="${esc(atual.path)}">Abrir arquivo</button>`:'<p class="empty">Sem arquivo anexado a este registro.</p>'}
    <label>Tipo no catálogo<select id="revisao-guiada-tipo">${opcoesCatalogo(chave)}</select></label>
    <label>Validade<input id="revisao-guiada-validade" type="date" value="${esc(validade)}"></label>
    <span class="badge ${SIT_CLASSE[situacao]}">${SIT_ACERVO[situacao]}</span>`;
}
function abrirRevisaoGuiada(){
  guiaIndice=0;guiaEdicao=null;
  $('#revisao-guiada-empresa').innerHTML='<option value="">Todas as empresas</option>'
    +state.companies.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  if(state.companies.length===1)$('#revisao-guiada-empresa').value=state.companies[0].id;
  $('#revisao-guiada-mostrar').value='todos';
  $('#revisao-guiada-busca').value='';
  renderRevisaoGuiada();
  $('#revisao-guiada').showModal();
}
function filtroRevisaoGuiadaMudou(){guiaIndice=0;guiaEdicao=null;renderRevisaoGuiada()}
async function confirmarRevisaoGuiada(){
  const registros=registrosGuiados(),atual=registros[guiaIndice];
  if(!atual)return;
  const tipoChave=valorGuiaAtual(atual,'tipoChave'),validade=valorGuiaAtual(atual,'validade');
  if(atual.origem==='certidoes'&&!validade){
    toast('Certidão não pode ficar sem validade. Preencha antes de confirmar.');
    return;
  }
  const botao=$('#revisao-guiada-confirmar'),chaveRegistro=`${atual.origem}:${atual.id}`;
  setBusy(botao,true,'Salvando...');
  try{
    const payload={};
    if(tipoChave!==atual.chave)payload.tipo_chave=tipoChave;
    if(validade!==atual.validade)payload.validade=validade||null;
    if(Object.keys(payload).length){
      const {error}=await client.from(atual.origem).update(payload).eq('id',atual.id);
      if(error)throw error;
      await loadData();
    }
    guiaEdicao=null;
    // O registro confirmado pode ter mudado de bloco ou saído do filtro (ex.:
    // deixou de ser "não reconhecido"); acha a posição dele na lista nova e
    // avança para o próximo, em vez de assumir que o índice continua valendo.
    const novaLista=registrosGuiados();
    const posicao=novaLista.findIndex(r=>`${r.origem}:${r.id}`===chaveRegistro);
    guiaIndice=posicao>=0?Math.min(posicao+1,novaLista.length-1):Math.min(guiaIndice,Math.max(0,novaLista.length-1));
    renderRevisaoGuiada();
    toast('Confirmado.');
  }catch(error){toast(friendlyError(error))}
  finally{setBusy(botao,false)}
}
function pularRevisaoGuiada(){
  if(revisaoGuiadaSuja()&&!confirm('Descartar as alterações deste documento e ir para o próximo sem salvar?'))return;
  const registros=registrosGuiados();
  guiaIndice=Math.min(guiaIndice+1,registros.length-1);
  guiaEdicao=null;
  renderRevisaoGuiada();
}
function voltarRevisaoGuiada(){
  if(revisaoGuiadaSuja()&&!confirm('Descartar as alterações deste documento e voltar para o anterior?'))return;
  guiaIndice=Math.max(guiaIndice-1,0);
  guiaEdicao=null;
  renderRevisaoGuiada();
}
function fecharRevisaoGuiada(){
  if(revisaoGuiadaSuja()&&!confirm('Descartar a alteração deste documento e fechar?'))return;
  guiaEdicao=null;
  $('#revisao-guiada').close();
}

function renderCertificates(){const filter=$('#certificate-filter')?.value||'all',all=[...state.certificates].sort((a,b)=>companyName(a.companyId).localeCompare(companyName(b.companyId),'pt-BR')||a.type.localeCompare(b.type,'pt-BR')||(b.validity||'').localeCompare(a.validity||'')),list=all.filter(c=>filter==='all'||status(c.validity)===filter),latest=new Set();all.forEach(c=>{const key=`${c.companyId}:${c.type}`;c.isLatest=!latest.has(key);latest.add(key)});$('#certificate-list').innerHTML=list.length?list.map(c=>`<tr><td>${esc(companyName(c.companyId))}</td><td><strong>${esc(c.type)}</strong><br><small>${c.isLatest?'Versão atual':'Histórico preservado'}</small></td><td>${esc(c.issuer||'—')}</td><td>${fmt(c.validity)}</td><td><span class="badge ${status(c.validity)}">${statusLabel(status(c.validity))}</span></td><td>${c.filePath?`<button class="link" data-document="${esc(c.filePath)}">Abrir PDF</button> · `:''}${c.link?`<a href="${esc(c.link)}" target="_blank" rel="noopener">Emitir nova ↗</a> · `:''}<button class="link" data-editar="certificate" data-editar-id="${c.id}">Editar</button> ${deleteButton('certificate',c.id,'Excluir')}</td></tr>`).join(''):'<tr><td colspan="6" class="empty">Nenhuma certidão nessa situação.</td></tr>'}
function renderNotices(){$('#notice-list').innerHTML=state.notices.length?state.notices.map(n=>{const itens=state.checklist.filter(c=>c.noticeId===n.id&&c.aplicavel!==false),r=window.Regras?Regras.contar(itens):{total:0,prontos:0,criticos:0};const st=n.statusProcesso||'rascunho';return`<article class="card notice-card"><div class="card-head"><div><h3>${esc(n.number)}</h3><div class="meta">${esc(companyName(n.companyId))} · ${esc(n.agency)} · Sessão ${fmt(n.opening)}${n.horaSessao?` às ${esc(String(n.horaSessao).slice(0,5))}`:''}</div></div><span class="badge ${st==='pronto'?'ok':st==='em_conferencia'?'pendente':'nao_aplicavel'}">${esc(STATUS_PROCESSO[st]||st)}</span></div><p class="notice-class">${esc(classificacaoLabel(n))}</p><p>${esc((n.object||'').slice(0,240))}${(n.object||'').length>240?'…':''}</p><div class="notice-stats"><span>${r.total?`${r.prontos}/${r.total} documentos`:'checklist não calculado'}</span>${r.criticos?`<span class="pend">${r.criticos} pendência(s)</span>`:''}<span>${(n.items||[]).length} itens</span><span>${esc(window.rotuloInteresse?rotuloInteresse(n.interesse):'')}</span></div><div class="record-actions"><button class="primary" data-wizard="${n.id}">Abrir assistente</button><button class="secondary" data-notice-detail="${n.id}">Ver detalhes</button>${n.filePath?`<button class="link" data-document="${esc(n.filePath)}">Abrir PDF original</button>`:''}<button class="link" data-go="agenda">Ver na agenda</button>${deleteButton('notice',n.id)}</div></article>`}).join(''):'<div class="empty">Nenhum edital cadastrado. Use o assistente para cadastrar o primeiro.</div>';renderSelects()}
function renderBalances(){$('#balance-list').innerHTML=state.balances.length?state.balances.map(b=>`<article class="card balance-card"><div class="card-head"><div><h3>${esc(companyName(b.companyId))}</h3><p>Exercício ${esc(b.year)} · ${esc(b.documentType||'Balanço anual')}</p></div><span class="badge ok">Arquivado</span></div><p>Período: ${fmt(b.periodStart)} a ${fmt(b.periodEnd)}<br>Registro/autenticação: ${fmt(b.registrationDate)}${b.registrationOffice?' · '+esc(b.registrationOffice):''}</p><div class="record-actions"><small>${esc(b.notes||'Balanço e demonstrações contábeis')}</small>${b.filePath?`<button class="link" data-document="${esc(b.filePath)}">Abrir arquivo</button> · `:''}<button class="link" data-editar="balance" data-editar-id="${b.id}">Editar</button>${deleteButton('balance',b.id)}</div></article>`).join(''):'<div class="empty">Nenhum balanço patrimonial arquivado.</div>'}
function renderPackages(){$('#saved-packages').innerHTML=state.packages.length?state.packages.map(p=>{const notice=state.notices.find(n=>n.id===p.noticeId),missing=(p.documents||[]).filter(d=>!d.path).length;return`<article class="card package-card"><div class="card-head"><div><h3>${esc(p.name)}</h3><p>${esc(companyName(p.companyId))} · ${esc(notice?.agency||'Órgão')}</p></div><span class="badge ${missing?'urgent':'ok'}">${missing?`${missing} pendência(s)`:'Completo'}</span></div><p>${p.documents.length} documento(s) vinculados · ${p.items.length} item(ns) na proposta</p><details><summary>Consultar documentos deste processo</summary>${p.documents.map(d=>`<div class="list-row"><span>${esc(d.title)}</span>${d.path?`<button class="link" data-document="${esc(d.path)}">Abrir</button>`:'<span class="badge missing">Pendente</span>'}</div>`).join('')}</details><div class="record-actions"><button class="primary" data-download-package="${p.id}">Baixar pacote ZIP</button>${deleteButton('package',p.id)}</div></article>`}).join(''):'<div class="empty">Nenhum pacote de processo criado.</div>'}
/* Bloco do checklist na tela do edital: leitura rápida do que está pronto e do
   que falta. O ajuste fino segue no assistente, mas dá pra mandar um documento
   avulso direto na linha, sem precisar abrir o assistente inteiro pra isso. */
const ROTULO_CHECKLIST=Regras.rotuloChecklist;
let itemUploadAberto=null; // id do item do checklist com o painel de envio aberto, na tela do edital
// Mesma lógica do assistente (wizard.js): itens cujo tipo do catálogo é
// "acumulativo" (representante legal, responsável técnico, atestados...)
// aceitam mais de um documento vinculado ao mesmo tempo. Vive em Regras para
// não duplicar entre os dois arquivos.
const itemAcumulativo=Regras.itemAcumulativo;
const vinculosDoItemChecklist=Regras.vinculosDoItem;
function checklistDoEdital(n){
  const itens=state.checklist.filter(c=>c.noticeId===n.id).sort((a,b)=>(a.ordem??0)-(b.ordem??0));
  if(!itens.length||!window.Regras)
    return `<article class="card detail-section"><h3>Checklist de habilitação</h3>
      <p class="empty">Ainda não calculado. Abra o assistente e classifique o processo para o sistema montar a documentação exigível pela Lei 14.133/2021.</p>
      <div class="record-actions"><button class="primary" data-wizard="${n.id}">Abrir assistente</button></div></article>`;
  const aplicaveis=itens.filter(i=>i.aplicavel!==false),r=Regras.contar(aplicaveis);
  const critica=Regras.criticarProcesso(processoDaLicitacao(n),aplicaveis,{});
  const pct=r.total?Math.round(r.prontos/r.total*100):0;
  const grupos=Object.entries(Regras.blocos).filter(([chave])=>itens.some(i=>i.bloco===chave));
  return `<article class="card detail-section">
    <div class="card-head"><div><h3>Checklist de habilitação</h3>
      <p>${r.prontos} de ${r.total} documentos prontos${critica.pendencias.length?` · ${critica.pendencias.length} pendência(s) crítica(s)`:''}</p></div>
      <span class="badge ${critica.pendencias.length?'pendente':'ok'}">${pct}%</span></div>
    <div class="ag-barra"><div class="ag-barra-fill${pct>=100?' full':pct>=60?' meio':''}" style="width:${pct}%"></div></div>
    ${grupos.map(([chave,bloco])=>`<div class="det-bloco">
      <div class="det-bloco-head"><h4>${esc(bloco.n)}</h4><span>${esc(bloco.base)}</span></div>
      ${itens.filter(i=>i.bloco===chave).map(i=>{
        const acumulativo=itemAcumulativo(i),vinculos=vinculosDoItemChecklist(i);
        return `<div class="det-item${acumulativo?' det-item-multiplo':''}${i.aplicavel===false?' inativo':''}">
        <span><strong>${esc(i.titulo)}</strong>${acumulativo&&vinculos.length?`<small>${vinculos.length} documento(s) vinculado(s)</small>`:i.validade?`<small>válido até ${fmt(i.validade)}</small>`:''}${i.aplicavel===false&&i.justificativa?`<small>${esc(i.justificativa)}</small>`:''}
        ${acumulativo&&vinculos.length?`<ul class="wz-vinculos">${vinculos.map(v=>`<li><span>${esc(v.nome||'Documento')}</span><button class="link" data-document="${esc(v.path)}">Abrir</button></li>`).join('')}</ul>`:''}</span>
        ${acumulativo?(i.aplicavel===false?'<span></span>':`<button type="button" class="link" data-enviar-item="${i.id}">${itemUploadAberto===i.id?'Fechar':'Enviar mais um ↑'}</button>`)
          :i.documentoRefPath?`<button class="link" data-document="${esc(i.documentoRefPath)}">Abrir</button>`
          :i.aplicavel===false?'<span></span>'
          :`<button type="button" class="link" data-enviar-item="${i.id}">${itemUploadAberto===i.id?'Fechar':'Enviar agora ↑'}</button>`}
        <span class="badge ${i.status}">${esc(ROTULO_CHECKLIST[i.status]||i.status)}</span>
        ${itemUploadAberto===i.id?`<div class="wz-upload det-item-upload">
          <input type="file" data-item-arquivo="${i.id}" accept=".pdf,.png,.jpg,.jpeg">
          <input type="date" data-item-validade="${i.id}" placeholder="Validade, se houver">
          <button type="button" class="primary" data-item-salvar="${i.id}">Salvar</button>
          <small>Vai para o acervo da empresa${acumulativo?' e se acrescenta aos já vinculados':' e fica vinculado a este item'}.</small>
        </div>`:''}</div>`;
      }).join('')}
    </div>`).join('')}
    ${critica.alertas.length?`<div class="warning"><strong>${esc(Regras.rotuloTipo(critica.alertas[0].tipo))}:</strong> ${esc(critica.alertas[0].texto)}${critica.alertas.length>1?` (e mais ${critica.alertas.length-1} alerta(s) no assistente)`:''}</div>`:''}
    <div class="record-actions"><button class="primary" data-wizard="${n.id}">Abrir assistente</button>
      <button class="secondary" data-checklist-edital="${n.id}">Baixar checklist em PDF</button></div>
  </article>`;
}
async function salvarUploadItem(itemId){
  const item=state.checklist.find(x=>x.id===itemId);
  if(!item){toast('Item não localizado.');return}
  const file=$(`[data-item-arquivo="${itemId}"]`)?.files?.[0],validade=$(`[data-item-validade="${itemId}"]`)?.value||null;
  if(!file){toast('Selecione o arquivo.');return}
  const botao=$(`[data-item-salvar="${itemId}"]`);
  setBusy(botao,true,'Enviando...');
  try{
    const tipoChave=Regras.tiposQueAtendem(item.chave)[0]?.chave||null;
    const categoria=CATEGORIA_DO_BLOCO[item.bloco]||'Outros';
    const path=await uploadDocument(file,item.companyId,`acervo/${safeFolder(item.titulo)}`);
    const {data,error}=await client.from('documentos_empresa').insert({empresa_id:item.companyId,categoria,
      tipo:item.titulo.slice(0,120),tipo_chave:tipoChave,nome_original:file.name,arquivo_path:path,
      origem:'Tela do edital',validade,criado_por:state.user.id}).select().single();
    if(error)throw error;
    const notice=state.notices.find(x=>x.id===item.noticeId);
    const dataAlvo=notice?.opening||Regras.hojeIso();
    const acumulativo=itemAcumulativo(item);
    const novoVinculo={tabela:'documentos_empresa',id:data.id,path,validade,nome:file.name};
    const vinculos=acumulativo?[...vinculosDoItemChecklist(item),novoVinculo]:[novoVinculo];
    const status=Regras.statusDosVinculos(vinculos,dataAlvo);
    const primeiro=vinculos[0];
    const {error:erroItem}=await client.from('licitacao_checklist_itens').update({
      documento_ref_tabela:primeiro.tabela,documento_ref_id:primeiro.id,documento_ref_path:primeiro.path,
      validade:primeiro.validade,documentos_vinculados:vinculos,status}).eq('id',itemId);
    if(erroItem)throw erroItem;
    itemUploadAberto=null;
    await loadData();
    renderNoticeDetail();
    toast(acumulativo?'Documento enviado ao acervo e acrescentado ao checklist.':'Documento enviado ao acervo e vinculado ao checklist.');
  }catch(error){toast(friendlyError(error))}
  finally{setBusy(botao,false)}
}

function providenciasDoEdital(n){
  const tarefas=state.agenda.filter(t=>t.noticeId===n.id&&!t.concluida)
    .sort((a,b)=>(a.prazo||'9999-12-31').localeCompare(b.prazo||'9999-12-31'));
  const hoje=new Date().toISOString().slice(0,10);
  return `<article class="card detail-section"><div class="card-head"><div><h3>Providências</h3>
    <p>O que precisa ser resolvido até a sessão.</p></div><button class="link" data-go="agenda">Ver na agenda</button></div>
    ${tarefas.length?tarefas.map(t=>`<div class="det-item">
      <span><strong>${esc(t.titulo)}</strong>${t.detalhe?`<small>${esc(t.detalhe)}</small>`:''}</span><span></span>
      <span class="badge ${t.prazo&&t.prazo<hoje?'vencido':'pendente'}">${t.prazo?`${t.prazo<hoje?'atrasada desde':'até'} ${fmt(t.prazo)}`:'sem prazo'}</span>
      </div>`).join(''):'<p class="empty">Nenhuma providência em aberto para este processo.</p>'}
  </article>`;
}

function renderNoticeDetail(){
  const root=$('#notice-detail-content'),n=state.notices.find(x=>x.id===state.selectedNoticeId);
  if(!n){root.innerHTML='<div class="empty">Selecione um edital na lista para abrir sua tela.</div>';return}
  const list=(title,items,empty)=>`<article class="card detail-section"><h3>${title}</h3>${items.length?`<ol>${items.map(item=>`<li>${esc(typeof item==='string'?item:item.descricao||item.description||JSON.stringify(item))}</li>`).join('')}</ol>`:`<p class="empty">${empty}</p>`}</article>`;
  const packages=state.packages.filter(p=>p.noticeId===n.id);
  const dias=n.opening&&window.Regras?Regras.diasEntre(Regras.hojeIso(),n.opening):null;
  const st=n.statusProcesso||'rascunho';
  const company=state.companies.find(c=>c.id===n.companyId);
  root.innerHTML=`<article class="card notice-hero">
    <div><span class="eyebrow">${esc(window.classificacaoLabel?classificacaoLabel(n):(n.modality||'PROCESSO LICITATÓRIO'))}</span>
      <h2>${esc(n.number)}</h2><p>${esc(n.agency)} · ${esc(companyName(n.companyId))}</p></div>
    <div class="hero-badges">
      <span class="badge ${dias!=null&&dias<0?'vencido':dias!=null&&dias<=7?'pendente':'ok'}">Sessão ${fmt(n.opening)}${n.horaSessao?` às ${esc(String(n.horaSessao).slice(0,5))}`:''}${dias!=null&&dias>=0?` · ${dias} dia(s)`:''}</span>
      <span class="badge ${st==='pronto'?'ok':st==='em_conferencia'?'pendente':'nao_aplicavel'}">${esc(STATUS_PROCESSO[st]||st)}</span>
      ${window.rotuloInteresse?`<span class="badge ${corInteresse(n.interesse)}">${esc(rotuloInteresse(n.interesse))}</span>`:''}
    </div></article>
  <article class="card"><h3>Objeto</h3><p>${esc(n.object)}</p>
    <div class="record-actions"><button class="primary" data-wizard="${n.id}">Abrir assistente</button>
      ${n.filePath?`<button class="secondary" data-document="${esc(n.filePath)}">Abrir edital original</button>`:''}
      <button class="secondary" data-go="packages">Preparar pacote</button>${deleteButton('notice',n.id)}</div></article>
  ${company&&n.opening?`<article class="card detail-section"><h3>Regularidade na data da sessão</h3>
    <p>Base documental projetada para ${fmt(n.opening)}, não para hoje — responde "a empresa vai ter documento apto naquele dia?".</p>
    ${painelProntidao(company,{compacto:true,dataAlvo:n.opening})}</article>`:''}
  ${checklistDoEdital(n)}
  ${providenciasDoEdital(n)}
  <div class="notice-detail-grid">
    ${list('Documentos e habilitação identificados no PDF',n.requirements,'Nenhum requisito documental identificado na leitura do edital.')}
    ${list('Proposta de preços',n.proposalRequirements,'Nenhuma exigência de proposta identificada.')}
    ${list('Declarações',n.declarations,'Nenhuma declaração identificada.')}
    ${list('Itens da disputa',n.items,'Nenhum item importado ou identificado.')}
    ${list('Pacotes deste processo',packages.map(p=>`${p.name} — ${p.documents.length} documento(s)`),'Nenhum pacote criado para este edital.')}
  </div>`;
}
function renderTrash(){const labels={company:'Empresa',certificate:'Certidão',document:'Documento',balance:'Balanço',notice:'Edital',package:'Pacote'},now=Date.now();$('#trash-list').innerHTML=state.trash.length?state.trash.sort((a,b)=>(b.deletedAt||'').localeCompare(a.deletedAt||'')).map(item=>{const elapsed=Math.floor((now-new Date(item.deletedAt).getTime())/86400000),remaining=Math.max(0,30-elapsed),owner=item.entity==='company'?item.title:(state.companies.find(c=>c.id===item.companyId)?.name||state.trash.find(x=>x.entity==='company'&&x.id===item.companyId)?.title||'Empresa não localizada');return`<article class="card trash-card"><div><span class="badge missing">${labels[item.entity]}</span><h3>${esc(item.title)}</h3><p>${esc(item.subtitle||'')} · ${esc(owner)}</p><small>Excluído em ${fmt(item.deletedAt?.slice(0,10))} · ${remaining} dia(s) até a limpeza automática</small></div><div class="trash-actions"><button class="secondary" data-restore-entity="${item.entity}" data-restore-id="${item.id}">Restaurar</button><button class="secondary danger" data-delete-entity="${item.entity}" data-delete-id="${item.id}">Apagar agora</button></div></article>`}).join(''):'<div class="empty">A lixeira está vazia.</div>'}
function keepSelectValue(selector,placeholder,options){const element=$(selector);if(!element)return;const previous=element.value;element.innerHTML=`<option value="">${placeholder}</option>`+options;if([...element.options].some(option=>option.value===previous))element.value=previous}
function renderSelects(){const opts=state.companies.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join(''),noticeOptions=state.notices.map(n=>`<option value="${n.id}">${esc(n.number)} — ${esc(n.agency)}</option>`).join('');keepSelectValue('#package-company','Selecione',opts);keepSelectValue('#batch-company','Selecione',opts);keepSelectValue('#archive-company','Selecione',opts);keepSelectValue('#archive-view-company','Selecione a empresa',opts);keepSelectValue('#balance-company','Selecione',opts);keepSelectValue('#dashboard-company','Todas as empresas',opts);keepSelectValue('#review-company','Selecione a empresa',opts);keepSelectValue('#package-notice','Selecione',noticeOptions);keepSelectValue('#items-notice','Selecione',noticeOptions)}
function renderAll(){renderMetrics();renderAlerts();renderUpcoming();renderSelects();renderCompanyDashboard();renderCompanies();renderArchive();renderCertificates();renderBalances();renderNotices();renderPackages();renderCompanyReview();renderNoticeDetail();renderTrash();renderAccess();if(window.renderAgenda)renderAgenda()}

const certificateTypes=['Federal/PGFN','FGTS','CNDT','Estadual','Municipal','Falência e recuperação','SICAF','Certidão simplificada da Junta Comercial','Regularidade profissional','Outra certidão'];
const certificateOptions=selected=>certificateTypes.map(type=>`<option ${type===selected?'selected':''}>${type}</option>`).join('');
function dateToIso(value){const m=value?.match(/(\d{2})[\/.-](\d{2})[\/.-](\d{4})/);if(!m)return'';const iso=`${m[3]}-${m[2]}-${m[1]}`,date=new Date(`${iso}T12:00:00`);return Number.isNaN(date.getTime())?'':iso}
function classifyCertificate(text,fileName){
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim(),name=normalize(fileName).replace(/\.[a-z0-9]{2,5}$/,''),source=normalize(text),rules=[
    ['FGTS',/(^|\s)(fgts|crf)(\s|$)|certificado.*regularidade.*fgts|regularidade.*fundo.*garantia/,/certificado de regularidade do fgts|regularidade.{0,60}fgts|fundo de garantia do tempo de servico|\bcrf\b/],
    ['CNDT',/(^|\s)cndt(\s|$)|trabalhista|debitos trabalhistas/,/certidao.{0,40}debitos trabalhistas|justica do trabalho|tribunal superior do trabalho|\bcndt\b/],
    ['Federal/PGFN',/(cnd|certidao)?.{0,15}(federal|pgfn|receita federal)|tributos federais|divida ativa|certidao conjunta/,/tributos federais.{0,100}divida ativa|procuradoria geral da fazenda nacional|receita federal do brasil|\bpgfn\b/],
    ['Estadual',/(cnd|certidao)?.{0,15}(estadual|sefaz)|fazenda estadual|tributos estaduais/,/certidao.{0,60}estadual|fazenda estadual|tributos estaduais|secretaria de estado.{0,50}fazenda|\bsefaz\b/],
    ['Municipal',/(cnd|certidao)?.{0,15}municipal|fazenda municipal|tributos municipais|cnd.{0,20}prefeitura/,/certidao.{0,60}municipal|fazenda municipal|tributos municipais|secretaria municipal.{0,50}fazenda|\bissqn\b/],
    ['Falência e recuperação',/falencia|recuperacao judicial|distribuidor civel/,/falencia.{0,80}recuperacao judicial|recuperacao judicial.{0,80}falencia|distribuidor civel/],
    ['SICAF',/sicaf|cadastramento unificado/,/sistema de cadastramento unificado de fornecedores|\bsicaf\b/],
    ['Certidão simplificada da Junta Comercial',/certidao simplificada|junta comercial|juceg/,/certidao simplificada|junta comercial|\bjuceg\b/],
    ['Regularidade profissional',/regularidade profissional|crc|conselho regional/,/regularidade profissional|conselho regional de contabilidade|\bcrc\b/]
  ];
  const found=rules.find(([,nameRegex,textRegex])=>nameRegex.test(name)||textRegex.test(source));return found?.[0]||'Outra certidão'
}
function certificateDates(text){const clean=text.replace(/\s+/g,' '),range=clean.match(/validade\s*:?\s*(?:de\s*)?(\d{2}[\/.-]\d{2}[\/.-]\d{4})\s*(?:a|ate|até)\s*(\d{2}[\/.-]\d{2}[\/.-]\d{4})/i),validity=range?.[2]||clean.match(/(?:valida|válida)\s+at[eé]\s+(\d{2}[\/.-]\d{2}[\/.-]\d{4})/i)?.[1]||clean.match(/validade\s*:?[^\d]{0,30}(\d{2}[\/.-]\d{2}[\/.-]\d{4})/i)?.[1],issued=clean.match(/(?:data\s+de\s+)?(?:emiss[aã]o|expedi[cç][aã]o)\s*:?[^\d]{0,20}(\d{2}[\/.-]\d{2}[\/.-]\d{4})/i)?.[1]||range?.[1];return{issued:dateToIso(issued),validity:dateToIso(validity)}}
function renderPendingCertificates(){const root=$('#batch-result');if(!pendingCertificates.length){root.innerHTML='';return}root.innerHTML=`<div class="batch-review"><div class="card-head"><div><h3>Conferir antes de importar</h3><p>Corrija os campos marcados antes de salvar.</p></div><button id="import-certificates" class="primary" type="button">Importar ${pendingCertificates.length} arquivo(s)</button></div>${pendingCertificates.map((item,index)=>`<div class="batch-row" data-batch-index="${index}"><div class="batch-file"><strong>${esc(item.file.name)}</strong><small>${item.scanned?'Pouco texto: pode ser PDF digitalizado. Revise os dados.':'Classificação sugerida pela leitura do PDF.'}</small>${item.type==='Outra certidão'?`<input data-batch-field="customType" value="${esc(item.customType||'')}" placeholder="Informe o nome desta nova certidão">`:''}</div><label>Tipo<select data-batch-field="type">${certificateOptions(item.type)}</select></label><label>Emissão<input data-batch-field="issued" type="date" value="${item.issued}"></label><label>Validade<input data-batch-field="validity" type="date" value="${item.validity}" class="${item.validity?'':'needs-review'}"></label></div>`).join('')}</div>`}
async function analyzeCertificateBatch(){const companyId=$('#batch-company').value,files=[...$('#batch-files').files];if(!companyId){toast('Selecione a empresa.');return}if(!files.length){toast('Selecione um ou mais PDFs.');return}if(files.length>30){toast('Importe no máximo 30 arquivos por vez.');return}const button=$('#analyze-certificates'),progress=$('#batch-progress');setBusy(button,true,'Lendo...');progress.hidden=false;pendingCertificates=[];for(let i=0;i<files.length;i++){const file=files[i];progress.textContent=`Lendo ${i+1} de ${files.length}: ${file.name}`;try{const result=await extractPdfText(file,(page,pages)=>progress.textContent=`${file.name}: página ${page} de ${pages}`),dates=certificateDates(result.text);pendingCertificates.push({file,type:classifyCertificate(result.text,file.name),issued:dates.issued,validity:dates.validity,scanned:result.text.trim().length<Math.max(200,result.pages*50)})}catch(error){pendingCertificates.push({file,type:'Outra certidão',issued:'',validity:'',scanned:true,error:friendlyError(error)})}}renderPendingCertificates();progress.textContent='Leitura concluída. Confira a classificação e as datas.';setBusy(button,false)}
async function importCertificateBatch(){const companyId=$('#batch-company').value,button=$('#import-certificates');if(pendingCertificates.some(item=>!item.validity)){toast('Informe a validade dos arquivos marcados.');return}if(pendingCertificates.some(item=>item.type==='Outra certidão'&&!item.customType?.trim())){toast('Informe o nome da certidão que não foi reconhecida.');return}setBusy(button,true,'Importando...');let imported=0;try{for(const item of pendingCertificates){const finalType=item.customType?.trim()||item.type,year=(item.issued||item.validity).slice(0,4),folder=`certidoes/${safeFolder(finalType)}/${year}`,path=await uploadDocument(item.file,companyId,folder),{error}=await client.from('certidoes').insert({empresa_id:companyId,tipo:finalType,orgao_emissor:finalType,emissao:item.issued||null,validade:item.validity,link_emissao:issuerLinks[finalType]||null,arquivo_path:path,criado_por:state.user.id});if(error)throw error;imported++}pendingCertificates=[];$('#batch-files').value='';renderPendingCertificates();await loadData();toast(`${imported} certidão(ões) importada(s).`)}catch(error){pendingCertificates=pendingCertificates.slice(imported);renderPendingCertificates();toast(`${imported} arquivo(s) importado(s). Falha seguinte: ${friendlyError(error)}`)}finally{setBusy(button,false)}}
function originalStoredName(path){const name=String(path||'').split('/').pop()||'';return name.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-/i,'')}
async function reclassifyImportedCertificates(){
  const companyId=$('#batch-company').value,button=$('#reclassify-certificates');if(!companyId){toast('Selecione primeiro a empresa.');return}
  const generic=/^(Outra certidão|Certidão não identificada|Documento não classificado)$/i,certificateChanges=state.certificates.filter(x=>x.companyId===companyId&&generic.test(x.type||'')).map(x=>({...x,newType:classifyCertificate('',originalStoredName(x.filePath))})).filter(x=>x.newType!=='Outra certidão'),documentChanges=state.documents.filter(x=>x.companyId===companyId&&(x.category==='Outros'||x.category==='Certidões'||generic.test(x.type||''))).map(x=>({...x,classification:archiveClassification('',`${x.sourceFolder||''}/${x.name||originalStoredName(x.filePath)}`)})).filter(x=>x.classification.category==='Certidões'&&(x.category!=='Certidões'||x.type!==x.classification.type));
  if(!certificateChanges.length&&!documentChanges.length){toast('Nenhuma certidão reconhecível pelo nome foi localizada.');return}
  if(!window.confirm(`O LiciDoc encontrou ${certificateChanges.length+documentChanges.length} registro(s) para corrigir pelos nomes dos arquivos. Deseja continuar?`))return;
  setBusy(button,true,'Reclassificando...');let updated=0,linked=0;
  try{
    for(const item of certificateChanges){const {error}=await client.from('certidoes').update({tipo:item.newType,orgao_emissor:item.newType,link_emissao:issuerLinks[item.newType]||null}).eq('id',item.id);if(error)throw error;updated++}
    for(const item of documentChanges){const type=item.classification.type,{error}=await client.from('documentos_empresa').update({categoria:'Certidões',tipo:type}).eq('id',item.id);if(error)throw error;updated++;if(item.validity&&!state.certificates.some(c=>c.filePath===item.filePath)){const {error:linkError}=await client.from('certidoes').insert({empresa_id:companyId,tipo:type,orgao_emissor:type,emissao:item.documentDate||null,validade:item.validity,link_emissao:issuerLinks[type]||null,arquivo_path:item.filePath,criado_por:state.user.id});if(linkError)throw linkError;linked++}}
    await loadData();toast(`${updated} registro(s) corrigido(s)${linked?` e ${linked} vinculado(s) ao controle de validade`:''}.`)
  }catch(error){toast(`${updated} registro(s) corrigido(s). Falha seguinte: ${friendlyError(error)}`)}finally{setBusy(button,false)}
}
const archiveExtensions=new Set(['pdf','doc','docx','xls','xlsx','csv','txt','png','jpg','jpeg']);
function archiveMime(name){const ext=name.split('.').pop().toLowerCase();return({pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',csv:'text/csv',txt:'text/plain',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg'})[ext]||'application/octet-stream'}
async function fileHash(file){const bytes=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());return[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function archiveClassification(text,path){const source=`${path}\n${text}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();if(/balanco|balancete|demonstracao.*contabil|\bdre\b|\becd\b|sped.*contabil/.test(source))return{category:'Balanços',type:/\bdre\b|demonstracao.*resultado/.test(source)?'Demonstração do resultado':'Balanço patrimonial'};if(/atestado.*capacidade|capacidade.*tecnica|acervo tecnico|cat\b/.test(source))return{category:'Atestados técnicos',type:'Atestado de capacidade técnica'};if(/contrato social|alteracao contratual|requerimento de empresario|estatuto social|ato constitutivo/.test(source))return{category:'Societários',type:'Documento societário'};const certType=classifyCertificate(text,path);if(/certidao|regularidade|cndt|fgts|sicaf|divida ativa/.test(source))return{category:'Certidões',type:certType==='Outra certidão'?'Certidão não identificada':certType};if(/alvara|licenca sanitaria|vigilancia sanitaria|licenca.*funcionamento/.test(source))return{category:'Licenças e alvarás',type:'Licença ou alvará'};if(/procuracao|credenciamento|representante legal/.test(source))return{category:'Representação',type:'Procuração ou credenciamento'};if(/declaracao/.test(source))return{category:'Declarações',type:'Declaração'};if(/proposta|memoria de calculo|composicao de custos|planilha.*preco/.test(source))return{category:'Propostas',type:'Proposta ou composição de preços'};if(/edital|pregao|concorrencia|dispensa|termo de referencia|recurso|contrarrazoes|impugnacao/.test(source))return{category:'Editais e processos',type:/recurso|contrarrazoes|impugnacao/.test(source)?'Recurso, contrarrazões ou impugnação':'Edital ou documento do processo'};if(/dados bancarios|conta bancaria|comprovante.*banco/.test(source))return{category:'Dados bancários',type:'Dados bancários'};if(/\brg\b|\bcpf\b|cnh|identidade/.test(source))return{category:'Identificação',type:'Documento de identificação'};return{category:'Outros',type:'Documento não classificado'}}
function archiveCategoryOptions(selected){return archiveCategories.map(x=>`<option ${x===selected?'selected':''}>${x}</option>`).join('')}
function renderPendingArchive(){
  const root=$('#archive-result');if(!pendingArchive.length){root.innerHTML='';return}
  const selected=pendingArchive.filter(x=>x.include&&!x.duplicate&&!x.limitReason).length,duplicates=pendingArchive.filter(x=>x.duplicate).length,oversized=pendingArchive.filter(x=>x.limitReason).length;
  root.innerHTML=`<div class="batch-review"><div class="card-head"><div><h3>Conferir acervo da empresa</h3><p>${pendingArchive.length} arquivo(s) localizado(s), ${duplicates} duplicidade(s), ${oversized} acima do limite individual e ${selected} selecionado(s) para importar.</p></div><div class="review-actions">${duplicates?'<button id="download-duplicates" class="secondary" type="button">Relatório de repetidos</button>':''}<button id="import-archive" class="primary" type="button" ${selected?'':'disabled'}>Importar ${selected} arquivo(s)</button></div></div>${pendingArchive.map((item,index)=>{
    const blocked=item.duplicate||item.limitReason,label=item.duplicate?'Repetido':item.limitReason||'Importar';
    return`<div class="archive-row ${blocked?'duplicate-row':''}" data-archive-index="${index}"><label class="archive-check"><input data-archive-field="include" type="checkbox" ${item.include&&!blocked?'checked':''} ${blocked?'disabled':''}>${esc(label)}</label><div class="batch-file"><strong>${esc(item.file.name)}</strong><small>${esc(item.relativePath)}</small>${item.duplicateOf?`<small class="duplicate-reference">Mesmo conteúdo de: ${esc(item.duplicateOf.name)}<br>${esc(item.duplicateOf.path||'Documento já arquivado no LiciDoc')}</small>`:''}${item.scanned?'<small>PDF com pouco texto: confira a classificação e as datas.</small>':''}</div><label>Categoria<select data-archive-field="category" ${blocked?'disabled':''}>${archiveCategoryOptions(item.category)}</select></label><label>Tipo/descrição<input data-archive-field="type" value="${esc(item.type)}" ${blocked?'disabled':''}></label><label>Data do documento<input data-archive-field="documentDate" type="date" value="${item.documentDate||''}" ${blocked?'disabled':''}></label><label>Validade<input data-archive-field="validity" type="date" value="${item.validity||''}" ${blocked?'disabled':''}></label>${item.category==='Balanços'?`<label>Exercício<input data-archive-field="exercise" type="number" min="2000" max="${new Date().getFullYear()}" value="${item.exercise||''}" ${blocked?'disabled':''}></label>`:''}</div>`
  }).join('')}</div>`
}
function downloadDuplicateReport(){const duplicates=pendingArchive.filter(x=>x.duplicate),cell=value=>`"${String(value||'').replace(/"/g,'""')}"`;if(!duplicates.length){toast('Nenhum arquivo repetido foi localizado.');return}const rows=[['Arquivo repetido','Caminho do repetido','Mesmo conteúdo de','Caminho do original','Já estava no LiciDoc'],...duplicates.map(x=>[x.file.name,x.relativePath,x.duplicateOf?.name,x.duplicateOf?.path,x.duplicateOf?.stored?'Sim':'Não, repetição no mesmo lote'])],csv='\ufeff'+rows.map(row=>row.map(cell).join(';')).join('\r\n');saveBlob(new Blob([csv],{type:'text/csv;charset=utf-8'}),`licidoc-arquivos-repetidos-${new Date().toISOString().slice(0,10)}.csv`)}
async function analyzeArchiveZip(){
  const companyId=$('#archive-company').value,zipFile=$('#archive-zip').files[0],folderFiles=[...$('#archive-folder').files],button=$('#analyze-archive'),progress=$('#archive-progress');
  if(!companyId||(!zipFile&&!folderFiles.length)){toast('Selecione a empresa e um ZIP ou uma pasta descompactada.');return}
  if(zipFile&&!window.JSZip){toast('Leitor de ZIP indisponível.');return}
  if(zipFile&&zipFile.size>1024*1024*1024){toast('O ZIP ultrapassa 1 GB. Use a opção de pasta descompactada.');return}
  setBusy(button,true,'Lendo...');progress.hidden=false;pendingArchive=[];
  try{
    let entries=[];
    if(folderFiles.length){
      entries=folderFiles.filter(file=>{const path=file.webkitRelativePath||file.name,name=path.split('/').pop();return!path.includes('/__MACOSX/')&&!name.startsWith('.')&&archiveExtensions.has(name.split('.').pop().toLowerCase())}).map(file=>({name:file.webkitRelativePath||file.name,file}));
    }else{
      const zip=await JSZip.loadAsync(zipFile);
      entries=Object.values(zip.files).filter(entry=>!entry.dir&&!entry.name.startsWith('__MACOSX/')&&!entry.name.split('/').pop().startsWith('.')&&archiveExtensions.has(entry.name.split('.').pop().toLowerCase())).map(entry=>({name:entry.name,entry}));
    }
    if(entries.length>1500)throw new Error('Foram encontrados mais de 1.500 arquivos. Divida o acervo em partes menores.');
    let extractedSize=0,oversized=0;
    const hashes=new Map(state.documents.filter(d=>d.companyId===companyId&&d.hash).map(d=>[d.hash,{name:d.name,path:d.sourceFolder||d.filePath,stored:true}]));
    for(let i=0;i<entries.length;i++){
      const source=entries[i];progress.textContent=`Analisando ${i+1} de ${entries.length}: ${source.name}`;
      const name=source.name.split('/').pop(),documentFile=source.file||new File([await source.entry.async('blob')],name,{type:archiveMime(name),lastModified:zipFile.lastModified});
      extractedSize+=documentFile.size;
      if(extractedSize>2*1024*1024*1024)throw new Error('O conteúdo total ultrapassa 2 GB. Divida o acervo em lotes menores.');
      if(documentFile.size>50*1024*1024){pendingArchive.push({file:documentFile,relativePath:source.name,hash:'',duplicate:false,include:false,category:'Outros',type:'Arquivo acima do limite individual',documentDate:'',validity:'',exercise:'',scanned:false,limitReason:'Arquivo maior que 50 MB'});oversized++;continue}
      const hash=await fileHash(documentFile),duplicateOf=hashes.get(hash),duplicate=Boolean(duplicateOf);if(!duplicate)hashes.set(hash,{name:documentFile.name,path:source.name,stored:false});
      let text='',pages=0;
      if(/\.pdf$/i.test(name)){try{const result=await extractPdfText(documentFile);text=result.text;pages=result.pages}catch(error){text=''}}
      const classification=archiveClassification(text,source.name),dates=certificateDates(text),yearMatch=`${source.name}\n${text.slice(0,3000)}`.match(/(?:exerc[ií]cio|balan[cç]o|dre|ecd)?[^0-9]{0,15}(20\d{2})/i);
      pendingArchive.push({file:documentFile,relativePath:source.name,hash,duplicate,duplicateOf,include:!duplicate,category:classification.category,type:classification.type,documentDate:dates.issued,validity:dates.validity,exercise:classification.category==='Balanços'?(yearMatch?.[1]||''):'',scanned:/\.pdf$/i.test(name)&&text.trim().length<Math.max(200,pages*50)});
    }
    renderPendingArchive();
    const total=(extractedSize/1024/1024).toLocaleString('pt-BR',{maximumFractionDigits:1});
    progress.textContent=`Leitura concluída: ${entries.length} arquivo(s), ${total} MB descompactados${oversized?` e ${oversized} acima de 50 MB`:''}. Revise antes de importar.`;
  }catch(error){progress.textContent=friendlyError(error);toast(friendlyError(error))}finally{setBusy(button,false)}
}
async function importArchive(){const companyId=$('#archive-company').value,button=$('#import-archive'),queue=pendingArchive.filter(x=>x.include&&!x.duplicate);if(!companyId||!queue.length){toast('Nenhum arquivo selecionado.');return}if(queue.some(x=>!x.category||!x.type?.trim())){toast('Informe a categoria e o tipo de todos os arquivos selecionados.');return}setBusy(button,true,'Importando...');let imported=0,certificates=0,balances=0;try{for(const item of queue){const year=(item.documentDate||item.validity||item.exercise||new Date().toISOString()).slice(0,4),folder=`acervo/${safeFolder(item.category)}/${year}`,path=await uploadDocument(item.file,companyId,folder),payload={empresa_id:companyId,categoria:item.category,tipo:item.type.trim(),nome_original:item.file.name,arquivo_path:path,origem:'Dropbox — importação ZIP',pasta_origem:item.relativePath.includes('/')?item.relativePath.split('/').slice(0,-1).join('/'):'/',tipo_chave:Regras.classificarNoCatalogo({categoria:item.category,tipo:item.type,nome:item.file.name}),data_documento:item.documentDate||null,validade:item.validity||null,sha256:item.hash,metadados:{caminho_original:item.relativePath,tamanho:item.file.size},criado_por:state.user.id},{error}=await client.from('documentos_empresa').insert(payload);if(error)throw error;if(item.category==='Certidões'&&item.validity){const {error:certError}=await client.from('certidoes').insert({empresa_id:companyId,tipo:item.type.trim(),orgao_emissor:item.type.trim(),emissao:item.documentDate||null,validade:item.validity,link_emissao:issuerLinks[item.type.trim()]||null,arquivo_path:path,criado_por:state.user.id});if(certError)throw certError;certificates++}if(item.category==='Balanços'&&item.exercise){const yearNumber=Number(item.exercise),{error:balanceError}=await client.from('balancos').insert({empresa_id:companyId,exercicio:yearNumber,tipo_documento:item.type.trim(),periodo_inicio:`${yearNumber}-01-01`,periodo_fim:`${yearNumber}-12-31`,arquivo_path:path,observacoes:`Importado do Dropbox. Caminho original: ${item.relativePath}`,criado_por:state.user.id});if(balanceError)throw balanceError;balances++}item.duplicate=true;item.include=false;imported++;renderPendingArchive()}await loadData();toast(`${imported} documento(s) arquivado(s); ${certificates} certidão(ões) e ${balances} balanço(s) vinculados.`)}catch(error){toast(`${imported} arquivo(s) importado(s). Falha seguinte: ${friendlyError(error)}`)}finally{setBusy(button,false)}}
function normalizeHeader(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')}
function findColumn(headers,patterns){return headers.findIndex(h=>patterns.some(p=>p.test(normalizeHeader(h))))}
async function importItemsSpreadsheet(){const noticeId=$('#items-notice').value,file=$('#items-file').files[0],button=$('#import-items'),root=$('#items-result');if(!noticeId||!file){toast('Selecione o processo e a planilha.');return}if(!window.XLSX){toast('Leitor de planilhas indisponível.');return}setBusy(button,true,'Importando...');try{const workbook=XLSX.read(await file.arrayBuffer(),{type:'array'}),sheet=workbook.Sheets[workbook.SheetNames[0]],rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false}).filter(row=>row.some(value=>String(value).trim()));if(rows.length<2)throw new Error('A planilha não possui linhas de itens.');const headerIndex=rows.findIndex(row=>row.some(value=>/(item|descri|produto|servi[cç]o|quantidade)/i.test(String(value))));if(headerIndex<0)throw new Error('Não foi possível localizar o cabeçalho da planilha.');const headers=rows[headerIndex],columns={item:findColumn(headers,[/^item$/,/^(n|numero|nro)$/]),descricao:findColumn(headers,[/descri/,/objeto/,/produto/,/servico/]),unidade:findColumn(headers,[/unidade/,/^und$/]),quantidade:findColumn(headers,[/quant/]),valor_unitario:findColumn(headers,[/valorunit/,/precounit/]),valor_total:findColumn(headers,[/valortotal/,/precototal/])},items=rows.slice(headerIndex+1).filter(row=>row.some(value=>String(value).trim())).map((row,index)=>({item:columns.item>=0?row[columns.item]:index+1,descricao:columns.descricao>=0?row[columns.descricao]:row.filter(Boolean).join(' | '),unidade:columns.unidade>=0?row[columns.unidade]:'',quantidade:columns.quantidade>=0?row[columns.quantidade]:'',valor_unitario:columns.valor_unitario>=0?row[columns.valor_unitario]:'',valor_total:columns.valor_total>=0?row[columns.valor_total]:''}));const {error}=await client.from('licitacoes').update({itens:items}).eq('id',noticeId);if(error)throw error;await loadData();root.innerHTML=`<div class="success-box"><strong>${items.length} item(ns) importado(s).</strong> Confira as descrições e quantidades antes de gerar a proposta.</div>`;toast('Planilha vinculada ao processo.')}catch(error){root.innerHTML=`<div class="warning">${esc(friendlyError(error))}</div>`}finally{setBusy(button,false)}}
function balanceGuidance(){const company=state.companies.find(c=>c.id===$('#balance-company').value),scenario=$('#balance-scenario').value,root=$('#balance-rule');if(!company){toast('Selecione a empresa.');return}const currentYear=new Date().getFullYear(),opened=company.openingDate?new Date(`${company.openingDate}T12:00:00`):null,ageYears=opened?(new Date()-opened)/31557600000:null,size=(company.size||'').toUpperCase(),isSmall=/MICRO|PEQUENO|\bME\b|\bEPP\b/.test(size),special=isSmall&&['pronta_entrega','locacao_materiais'].includes(scenario);let years=[],headline='Conferir os dois últimos exercícios sociais';if(opened&&opened.getFullYear()===currentYear){headline='Empresa constituída no exercício atual';years=[]}else if(ageYears!==null&&ageYears<2){headline='Empresa constituída há menos de dois anos';years=[currentYear-1].filter(y=>!opened||y>=opened.getFullYear())}else years=[currentYear-1,currentYear-2];const checks=years.map(year=>({year,found:state.balances.some(b=>b.companyId===company.id&&Number(b.year)===year)}));root.innerHTML=`<div class="result"><h3>${esc(headline)}</h3>${!company.openingDate?'<div class="warning">Cadastre a data de abertura para uma orientação mais precisa.</div>':''}${opened&&opened.getFullYear()===currentYear?'<p>Providencie balanço de abertura e demonstrações do período, conforme o edital e a forma legal de escrituração.</p>':`<p>Exercício(s) normalmente pertinente(s): <strong>${years.join(' e ')||'verificar balanço de abertura'}</strong>.</p>`}${checks.map(x=>`<div class="check"><span>Balanço do exercício ${x.year}</span><span class="badge ${x.found?'ok':'missing'}">${x.found?'Arquivado':'Pendente'}</span></div>`).join('')}${special?'<div class="warning"><strong>Possível dispensa específica:</strong> para ME/EPP, o Decreto nº 8.538/2015 prevê dispensa no fornecimento de bens para pronta entrega ou locação de materiais, no âmbito de sua aplicação. Confirme o edital e o regulamento do órgão.</div>':''}<p><small>ME, EPP ou MEI não são considerados dispensados automaticamente. Quando o edital exigir qualificação econômico-financeira, mantenha balanço, DRE e demais peças legalmente autenticadas ou transmitidas.</small></p></div>`}
function openBalanceModal(){const options=state.companies.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');if(!state.companies.length){toast('Cadastre uma empresa primeiro.');return false}$('#modal-title').textContent='Adicionar balanço patrimonial';$('#modal-content').innerHTML=`<div class="form-grid"><label class="full">Empresa<select name="companyId" required><option value="">Selecione</option>${options}</select></label><label>Exercício<input name="year" type="number" min="2000" max="${new Date().getFullYear()}" required value="${new Date().getFullYear()-1}"></label><label>Tipo<select name="documentType"><option>Balanço anual</option><option>Balanço de abertura</option><option>Balanço intermediário</option></select></label><label>Início do período<input name="periodStart" type="date"></label><label>Fim do período<input name="periodEnd" type="date" required></label><label>Data do registro/autenticação<input name="registrationDate" type="date"></label><label>Órgão ou forma de registro<input name="registrationOffice" placeholder="SPED/ECD, Junta Comercial..."></label><label class="full">Arquivo PDF<input name="file" type="file" accept="application/pdf,.pdf" required></label><label class="full">Observações<textarea name="notes" placeholder="Ex.: balanço, DRE, índices e termos de abertura/encerramento"></textarea></label></div>`;const formB=$('#modal-form');formB.dataset.type='balance';delete formB.dataset.modo;delete formB.dataset.registro;$('#modal').showModal();return true}
async function createProcessPackage(){
  const companyId=$('#package-company').value,notice=state.notices.find(n=>n.id===$('#package-notice').value),button=$('#build-package');
  if(!companyId||!notice){toast('Selecione empresa e edital.');return}
  if(notice.companyId!==companyId){toast('Este edital está cadastrado para outra empresa. Abra o assistente para ajustar.');return}
  if(!notice.tipoObjeto){toast('Classifique o processo no assistente antes de gerar o pacote.');abrirWizard(notice.id);return}
  setBusy(button,true,'Criando...');
  try{
    const salvos=state.checklist.filter(c=>c.noticeId===notice.id);
    const itens=montarChecklist(notice,salvos);
    const pacoteId=await criarPacoteDoChecklist(notice,itens);
    const critica=Regras.criticarProcesso(processoDaLicitacao(notice),itens.filter(i=>i.aplicavel!==false),{});
    const r=critica.resumo;
    $('#package-result').innerHTML=`<div class="result"><h3>Pacote criado para ${esc(notice.number)}</h3>
      <p><strong>${r.prontos}</strong> documento(s) prontos, <strong>${r.criticos}</strong> pendência(s) em ${r.total} item(ns) da matriz.</p>
      ${itens.filter(i=>i.aplicavel!==false).map(i=>`<div class="check"><span>${esc(i.titulo)}${i.validade?`<br><small>Válido até ${fmt(i.validade)}</small>`:''}</span><span class="badge ${i.status}">${esc(({ok:'Incluído',gerado:'Gerado',vencido:'Vencido',pendente:'Pendente',ausente:'Ausente'})[i.status]||i.status)}</span></div>`).join('')}
      <button class="primary" data-download-package="${pacoteId}">Baixar pacote ZIP</button></div>`;
    toast('Pacote vinculado ao processo.');
  }catch(error){toast(friendlyError(error))}
  finally{setBusy(button,false)}
}
/* Cria o pacote a partir do checklist calculado pela matriz, e não mais do
   cruzamento ad-hoc de requisitos em texto livre. */
/* Checklist consolidado em PDF. Sem plugin de tabela: o layout é desenhado à
   mão para não acrescentar uma segunda dependência ao projeto. */
const PDF_STATUS={
  incluido:{t:'INCLUÍDO',c:[2,122,72]},
  gerado:{t:'GERADO',c:[36,87,214]},
  vencido:{t:'VENCIDO',c:[180,35,24]},
  pendente:{t:'PENDENTE',c:[181,71,8]},
  nao_aplicavel:{t:'NÃO SE APLICA',c:[102,112,133]}
};
// Nome deliberadamente diferente de Regras.situacaoDoDocumento: aquela decide
// vigência de um documento do acervo (sem_validade/vencido/vence_logo/vigente);
// esta decide o status de uma linha de documento dentro de um PACOTE/PDF de
// checklist (nao_aplicavel/gerado/vencido/incluido/pendente) — coisas diferentes.
function situacaoDoItemPacote(d){
  if(d.aplicavel===false)return'nao_aplicavel';
  if(d.status==='gerado')return'gerado';
  if(d.status==='vencido')return'vencido';
  return d.path?'incluido':'pendente';
}
function checklistPdf(company,notice,documentos){
  if(!window.jspdf?.jsPDF)return null;
  const doc=new window.jspdf.jsPDF({unit:'mm',format:'a4'});
  const M=14,LARGURA=210-M*2,FIM=297-18;
  let y=M;
  const cinza=[102,112,133],texto=[28,39,55],linha=[223,228,235];

  const quebra=altura=>{if(y+altura>FIM){doc.addPage();y=M}};
  const escreve=(txt,x,tamanho,estilo,cor,largura)=>{
    doc.setFont('helvetica',estilo).setFontSize(tamanho).setTextColor(...cor);
    const linhas=doc.splitTextToSize(String(txt??''),largura||LARGURA);
    linhas.forEach(l=>{doc.text(l,x,y);y+=tamanho*0.42+1.2});
    return linhas.length;
  };

  doc.setFillColor(36,87,214).rect(0,0,210,4,'F');
  y=M+6;
  escreve('CHECKLIST DE HABILITAÇÃO',M,16,'bold',texto);
  y+=1;
  escreve(notice.number||'Processo sem número',M,11,'normal',cinza);
  y+=4;

  const dias=notice.opening?Regras.diasEntre(Regras.hojeIso(),notice.opening):null;
  const sessao=notice.opening
    ?`${fmt(notice.opening)}${notice.horaSessao?` às ${String(notice.horaSessao).slice(0,5)}`:''}${dias!=null&&dias>=0?` — faltam ${dias} dia(s)`:dias!=null?' — já realizada':''}`
    :'Não informada';
  [['Empresa',company.name],['CNPJ',company.cnpj],['Órgão',notice.agency],
   ['Sessão',sessao],['Classificação',classificacaoLabel(notice)]].forEach(([rotulo,valor])=>{
    quebra(6);
    doc.setFont('helvetica','bold').setFontSize(8.5).setTextColor(...cinza).text(rotulo.toUpperCase(),M,y);
    const antes=y;
    doc.setFont('helvetica','normal').setFontSize(9.5).setTextColor(...texto);
    doc.splitTextToSize(String(valor||'—'),LARGURA-32).forEach((l,i)=>doc.text(l,M+32,antes+i*4.2));
    y=antes+Math.max(4.6,doc.splitTextToSize(String(valor||'—'),LARGURA-32).length*4.2);
  });

  y+=3;
  const contagem={incluido:0,gerado:0,vencido:0,pendente:0,nao_aplicavel:0};
  documentos.forEach(d=>contagem[situacaoDoItemPacote(d)]++);
  quebra(14);
  doc.setFillColor(248,249,251).setDrawColor(...linha).roundedRect(M,y,LARGURA,11,2,2,'FD');
  let cx=M+5;
  Object.entries(PDF_STATUS).forEach(([chave,cfg])=>{
    doc.setFillColor(...cfg.c).circle(cx,y+5.6,1.4,'F');
    doc.setFont('helvetica','bold').setFontSize(9).setTextColor(...texto).text(String(contagem[chave]),cx+3,y+6.6);
    const largura=doc.getTextWidth(String(contagem[chave]));
    doc.setFont('helvetica','normal').setFontSize(8).setTextColor(...cinza).text(cfg.t.toLowerCase(),cx+4.5+largura,y+6.6);
    cx+=10+largura+doc.getTextWidth(cfg.t.toLowerCase());
  });
  y+=17;

  const usados=new Set();
  Object.entries(Regras.blocos).forEach(([chave,bloco])=>{
    const itens=documentos.filter(d=>d.bloco===chave);
    if(!itens.length)return;
    quebra(18);
    doc.setFillColor(234,240,254).rect(M,y-4,LARGURA,7,'F');
    doc.setFont('helvetica','bold').setFontSize(9.5).setTextColor(36,87,214).text(bloco.n.toUpperCase(),M+2,y+0.8);
    doc.setFont('helvetica','normal').setFontSize(8.5).setTextColor(...cinza)
       .text(bloco.base,M+LARGURA-2,y+0.8,{align:'right'});
    y+=9;
    itens.forEach(d=>{
      usados.add(d);
      const cfg=PDF_STATUS[situacaoDoItemPacote(d)];
      const detalhes=[];
      if(d.aplicavel===false)detalhes.push(`justificativa: ${d.justificativa||'não informada'}`);
      else{
        if(d.validity)detalhes.push(`válido até ${fmt(d.validity)}`);
        if(d.obrigatorio===false)detalhes.push('exigível conforme o edital');
      }
      const corpo=doc.splitTextToSize(d.title,LARGURA-36);
      const extra=detalhes.length?doc.splitTextToSize(detalhes.join(' · '),LARGURA-36):[];
      quebra(corpo.length*4.2+extra.length*3.8+7);
      doc.setFillColor(...cfg.c).roundedRect(M,y-3.2,31,4.6,1.2,1.2,'F');
      doc.setFont('helvetica','bold').setFontSize(6.4).setTextColor(255,255,255)
         .text(cfg.t,M+15.5,y-0.1,{align:'center'});
      doc.setFont('helvetica','normal').setFontSize(9.5).setTextColor(...texto);
      corpo.forEach((l,i)=>doc.text(l,M+36,y+i*4.2));
      y+=corpo.length*4.2;
      if(extra.length){
        doc.setFont('helvetica','italic').setFontSize(8).setTextColor(...cinza);
        extra.forEach((l,i)=>doc.text(l,M+36,y+i*3.8-0.8));
        y+=extra.length*3.8;
      }
      /* 5.2 de avanço com a linha em y-3.4 deixa a separadora 1 mm acima do topo
         do texto seguinte: sem colisão e sem desperdiçar meia página. */
      y+=5.2;
      doc.setDrawColor(...linha).line(M,y-3.4,M+LARGURA,y-3.4);
    });
    y+=5;
  });

  const soltos=documentos.filter(d=>!usados.has(d));
  if(soltos.length){
    quebra(16);
    doc.setFillColor(234,240,254).rect(M,y-4,LARGURA,7,'F');
    doc.setFont('helvetica','bold').setFontSize(9.5).setTextColor(36,87,214).text('OUTROS DOCUMENTOS DO PACOTE',M+2,y+0.8);
    y+=9;
    soltos.forEach(d=>{
      const cfg=PDF_STATUS[situacaoDoItemPacote(d)];
      quebra(7);
      doc.setFillColor(...cfg.c).roundedRect(M,y-3.2,31,4.6,1.2,1.2,'F');
      doc.setFont('helvetica','bold').setFontSize(6.4).setTextColor(255,255,255).text(cfg.t,M+15.5,y-0.1,{align:'center'});
      doc.setFont('helvetica','normal').setFontSize(9.5).setTextColor(...texto).text(d.title,M+36,y);
      y+=6;
    });
  }

  const pendentes=documentos.filter(d=>d.aplicavel!==false&&!d.path&&d.status!=='gerado').length;
  quebra(16);
  y+=2;
  doc.setFillColor(pendentes?254:209,pendentes?240:250,pendentes?199:223).setDrawColor(...linha).roundedRect(M,y,LARGURA,9,2,2,'FD');
  doc.setFont('helvetica','bold').setFontSize(9).setTextColor(pendentes?181:2,pendentes?71:122,pendentes?8:72)
     .text(pendentes?`${pendentes} item(ns) pendente(s) neste pacote.`:'Nenhuma pendência registrada neste pacote.',M+4,y+5.8);

  const paginas=doc.getNumberOfPages();
  for(let i=1;i<=paginas;i++){
    doc.setPage(i);
    doc.setDrawColor(...linha).line(M,297-14,M+LARGURA,297-14);
    doc.setFont('helvetica','normal').setFontSize(7).setTextColor(...cinza);
    doc.text('Confira o edital original, os documentos, os valores, as assinaturas e a validade na data da sessão antes do envio.',M,297-10);
    doc.text(`LiciDoc · gerado em ${new Date().toLocaleString('pt-BR')} · página ${i} de ${paginas}`,M,297-6.5);
  }
  return doc.output('arraybuffer');
}

function baixarChecklistPdf(company,notice,documentos){
  const bytes=checklistPdf(company,notice,documentos);
  if(!bytes){
    saveBlob(new Blob([checklistCompleto(company,notice,documentos)],{type:'text/plain;charset=utf-8'}),`checklist-${safeFolder(notice.number)}.txt`);
    toast('Gerador de PDF indisponível: o checklist saiu em texto.');
    return;
  }
  saveBlob(new Blob([bytes],{type:'application/pdf'}),`checklist-${safeFolder(notice.number)}-${safeFolder(company.name)}.pdf`);
  toast('Checklist em PDF gerado.');
}

/* Normaliza o checklist do assistente no formato usado pelo pacote, pelo ZIP e
   pelo checklist em PDF. Compartilhado com wizard.js (baixar checklist em PDF
   direto do assistente) — vive em Regras para não duplicar. */
const documentosDoChecklist=Regras.documentosDoChecklist;

async function criarPacoteDoChecklist(notice,itens){
  const aplicaveis=itens.filter(i=>i.aplicavel!==false);
  const documentos=documentosDoChecklist(notice,itens);
  const pendentes=documentos.filter(d=>d.aplicavel&&!d.path&&d.status!=='gerado').length;
  const {data,error}=await client.from('pacotes').insert({empresa_id:notice.companyId,licitacao_id:notice.id,
    nome:`Processo ${notice.number}`,status:pendentes?'pendente':'pronto',documentos,
    proposta:{requisitos:notice.proposalRequirements||[],objeto:notice.object,valorEstimado:notice.valorEstimado||null},
    declaracoes:aplicaveis.filter(i=>i.bloco==='declaracoes').map(i=>i.titulo),
    itens:notice.items||[],criado_por:state.user.id}).select().single();
  if(error)throw error;
  await loadData();
  return data.id;
}

function documentShell(title,body){return`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;font-size:12pt;line-height:1.5;margin:2.5cm}h1{text-align:center;font-size:16pt}h2{font-size:13pt;margin-top:28px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #333;padding:6px}th{background:#eee}.signature{margin-top:60px;text-align:center}</style></head><body><h1>${esc(title)}</h1>${body}</body></html>`}
function proposalDocument(company,notice,pkg){const rows=(pkg.items||[]).map(item=>`<tr><td>${esc(item.item)}</td><td>${esc(item.descricao)}</td><td>${esc(item.unidade)}</td><td>${esc(item.quantidade)}</td><td>${esc(item.valor_unitario||'')}</td><td>${esc(item.valor_total||'')}</td></tr>`).join('');return documentShell(`PROPOSTA DE PREÇOS — ${notice.number}`,`<p><strong>Ao(À) ${esc(notice.agency)}</strong></p><p><strong>Proponente:</strong> ${esc(company.name)}<br><strong>CNPJ:</strong> ${esc(company.cnpj)}<br><strong>Objeto:</strong> ${esc(notice.object)}</p><table><thead><tr><th>Item</th><th>Descrição</th><th>Unidade</th><th>Quantidade</th><th>Valor unitário</th><th>Valor total</th></tr></thead><tbody>${rows||'<tr><td colspan="6">[CONFERIR E PREENCHER OS ITENS DO EDITAL]</td></tr>'}</tbody></table><h2>Condições da proposta</h2><ul>${(pkg.proposal?.requisitos||[]).map(x=>`<li>${esc(x)}</li>`).join('')||'<li>[CONFERIR PRAZO DE VALIDADE, ENTREGA, GARANTIA E DEMAIS CONDIÇÕES DO EDITAL]</li>'}</ul><p class="signature">________________________________________<br>Representante legal</p>`)}
function declarationText(title,company,notice){const lower=title.toLowerCase();let body='declara, sob as penas da lei, que atende integralmente à exigência indicada no edital, conforme a documentação e as condições aplicáveis.';if(/7º|menor/.test(lower))body='declara que não emprega menor de dezoito anos em trabalho noturno, perigoso ou insalubre e não emprega menor de dezesseis anos, salvo na condição de aprendiz a partir de quatorze anos.';else if(/impeditivo/.test(lower))body='declara que não existem fatos impeditivos à sua habilitação e que comunicará qualquer ocorrência superveniente.';else if(/reserva/.test(lower))body='declara que cumpre as exigências legais de reserva de cargos para pessoa com deficiência e para reabilitado da Previdência Social, quando aplicáveis.';else if(/independente/.test(lower))body='declara que a proposta foi elaborada de maneira independente, nos termos e limites previstos no edital.';else if(/conhecimento|aceita[cç][aã]o/.test(lower))body='declara que conhece e aceita as condições do edital, seus anexos e as características necessárias à execução do objeto.';return`<h2>${esc(title)}</h2><p>${esc(company.name)}, inscrita no CNPJ sob nº ${esc(company.cnpj)}, por seu representante legal, ${body}</p>`}
function declarationsDocument(company,notice,pkg){const declarations=pkg.declarations.length?pkg.declarations:['Declaração de inexistência de fatos impeditivos','Declaração de cumprimento do art. 7º, XXXIII, da Constituição','Declaração de pleno conhecimento e aceitação do edital'];return documentShell(`DECLARAÇÕES — ${notice.number}`,`${declarations.map(x=>declarationText(x,company,notice)).join('')}<p class="signature">________________________________________<br>Representante legal</p>`)}
function saveBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
const entityTables={company:'empresas',certificate:'certidoes',document:'documentos_empresa',balance:'balancos',notice:'licitacoes',package:'pacotes'};
async function moveToTrash(entity,recordId){if(entity==='company'&&!isAdmin()){toast('Somente o administrador pode excluir empresas.');return}if(!confirm('Mover este registro para a lixeira? Ele poderá ser restaurado por 30 dias.'))return;const {error}=await client.from(entityTables[entity]).update({excluido_em:new Date().toISOString(),excluido_por:state.user.id}).eq('id',recordId);if(error){toast(/excluido_em/i.test(error.message)?'Execute a atualização SQL da lixeira no Supabase.':friendlyError(error));return}if(entity==='notice'&&state.selectedNoticeId===recordId)state.selectedNoticeId=null;await loadData();toast('Registro movido para a lixeira.')}
async function restoreFromTrash(entity,recordId){const item=state.trash.find(x=>x.entity===entity&&x.id===recordId);if(entity!=='company'&&item&&state.trash.some(x=>x.entity==='company'&&x.id===item.companyId)){toast('Restaure primeiro a empresa vinculada.');return}const {error}=await client.from(entityTables[entity]).update({excluido_em:null,excluido_por:null}).eq('id',recordId);if(error){toast(friendlyError(error));return}await loadData();toast('Registro restaurado.')}
async function storagePathsForDeletion(item){if(item.entity!=='company')return[item.filePath].filter(Boolean);const results=await Promise.all([client.from('certidoes').select('arquivo_path').eq('empresa_id',item.id),client.from('documentos_empresa').select('arquivo_path').eq('empresa_id',item.id),client.from('balancos').select('arquivo_path').eq('empresa_id',item.id),client.from('licitacoes').select('edital_path').eq('empresa_id',item.id)]);return[...new Set(results.flatMap((result,index)=>(result.data||[]).map(row=>index===3?row.edital_path:row.arquivo_path)).filter(Boolean))]}
async function permanentDelete(entity,recordId,{ask=true,reload=true,quiet=false}={}){const item=state.trash.find(x=>x.entity===entity&&x.id===recordId);if(!item)return false;if(entity==='company'&&!isAdmin()){if(!quiet)toast('Somente o administrador pode apagar empresas.');return false}if(ask&&!confirm(`EXCLUSÃO DEFINITIVA\n\n“${item.title}” será apagado sem possibilidade de recuperação. Deseja continuar?`))return false;const paths=await storagePathsForDeletion(item),{error}=await client.from(entityTables[entity]).delete().eq('id',recordId);if(error){if(!quiet)toast(friendlyError(error));return false}if(paths.length){const {error:storageError}=await client.storage.from('documentos').remove(paths);if(storageError&&!quiet)toast(`Registro apagado, mas houve falha ao limpar arquivos: ${friendlyError(storageError)}`)}state.trash=state.trash.filter(x=>!(x.entity===entity&&x.id===recordId));if(reload)await loadData();if(!quiet)toast('Registro apagado definitivamente.');return true}
async function purgeExpiredTrash(){const cutoff=Date.now()-30*86400000,expired=state.trash.filter(item=>new Date(item.deletedAt).getTime()<=cutoff).sort((a,b)=>(a.entity==='company')-(b.entity==='company'));if(!expired.length)return;for(const item of expired)await permanentDelete(item.entity,item.id,{ask:false,reload:false,quiet:true});state.trash=state.trash.filter(item=>new Date(item.deletedAt).getTime()>cutoff)}
async function emptyTrash(){if(!state.trash.length){toast('A lixeira já está vazia.');return}if(!confirm(`Apagar definitivamente os ${state.trash.length} registro(s) da lixeira? Esta ação não pode ser desfeita.`))return;const queue=[...state.trash].sort((a,b)=>(a.entity==='company')-(b.entity==='company'));let removed=0;for(const item of queue)if(await permanentDelete(item.entity,item.id,{ask:false,reload:false,quiet:true}))removed++;await loadData();toast(`${removed} registro(s) apagado(s) definitivamente.`)}
async function downloadProcessPackage(packageId){
  const pkg=state.packages.find(p=>p.id===packageId),company=state.companies.find(c=>c.id===pkg?.companyId),notice=state.notices.find(n=>n.id===pkg?.noticeId);
  if(!pkg||!company||!notice){toast('Pacote não localizado.');return}
  if(!window.JSZip){toast('Gerador de pacote indisponível.');return}
  const zip=new JSZip(),root=zip.folder(safeFolder(pkg.name));
  // Pacotes criados pela matriz trazem a pasta pronta em `categoria`; os antigos
  // usam a categoria genérica e continuam abrindo normalmente.
  const pelaMatriz=pkg.documents.some(d=>d.categoria);
  const pastaProposta=pelaMatriz?'05-proposta':'02-proposta';
  const pastaDeclaracoes=pelaMatriz?'06-declaracoes':'03-declaracoes';
  for(const doc of pkg.documents.filter(d=>d.path&&d.aplicavel!==false)){
    try{
      const {data,error}=await client.storage.from('documentos').createSignedUrl(doc.path,180);
      if(error)throw error;
      const response=await fetch(data.signedUrl);
      if(!response.ok)throw new Error('Falha ao baixar documento.');
      root.folder(doc.categoria||safeFolder(doc.category)).file(`${safeFolder(doc.title)}-${doc.path.split('/').pop()}`,await response.blob());
    }catch(error){root.file(`PENDENCIA-${safeFolder(doc.title)}.txt`,friendlyError(error))}
  }
  root.file(`${pastaProposta}/proposta-de-precos.doc`,proposalDocument(company,notice,pkg));
  root.file(`${pastaDeclaracoes}/declaracoes.doc`,declarationsDocument(company,notice,pkg));
  if(window.XLSX&&pkg.items.length){
    const workbook=XLSX.utils.book_new(),sheet=XLSX.utils.json_to_sheet(pkg.items);
    XLSX.utils.book_append_sheet(workbook,sheet,'Itens');
    root.file(`${pastaProposta}/planilha-de-itens.xlsx`,XLSX.write(workbook,{bookType:'xlsx',type:'array'}));
  }
  const checklistBytes=checklistPdf(company,notice,pkg.documents);
  if(checklistBytes)root.file('00-checklist-completo.pdf',checklistBytes);
  else root.file('00-checklist-completo.txt',checklistCompleto(company,notice,pkg.documents));

  saveBlob(await zip.generateAsync({type:'blob'}),`${safeFolder(pkg.name)}-${safeFolder(company.name)}.zip`);
  toast('Pacote gerado para download.');
}

/* Checklist do ZIP: todos os itens da matriz, com o status de cada um. */
function checklistCompleto(company,notice,documentos){
  const linhas=[`Empresa: ${company.name}`,`CNPJ: ${company.cnpj}`,`Processo: ${notice.number}`,`Órgão: ${notice.agency}`,
    `Sessão: ${fmt(notice.opening)}${notice.horaSessao?` às ${String(notice.horaSessao).slice(0,5)}`:''}`,
    `Classificação: ${window.classificacaoLabel?classificacaoLabel(notice):(notice.modality||'—')}`,
    `Gerado em: ${new Date().toLocaleString('pt-BR')}`,''];
  const grupos=window.Regras?Object.entries(Regras.blocos):[];
  const usados=new Set();
  grupos.forEach(([chave,bloco])=>{
    const itens=documentos.filter(d=>d.bloco===chave);
    if(!itens.length)return;
    linhas.push(`${bloco.pasta.toUpperCase()} — ${bloco.n} (${bloco.base})`);
    itens.forEach(d=>{
      usados.add(d);
      const marca=d.aplicavel===false?`[NÃO SE APLICA — ${d.justificativa||'sem justificativa'}]`
        :d.status==='gerado'?'[GERADO PELO SISTEMA]'
        :d.path?(d.status==='vencido'?'[VENCIDO PARA A SESSÃO]':'[INCLUÍDO]')
        :'[PENDENTE]';
      linhas.push(`  ${marca} ${d.title}${d.validity?` — válido até ${fmt(d.validity)}`:''}${d.obrigatorio===false?' (exigível conforme o edital)':''}`);
    });
    linhas.push('');
  });
  const soltos=documentos.filter(d=>!usados.has(d));
  if(soltos.length){
    linhas.push('OUTROS DOCUMENTOS DO PACOTE');
    soltos.forEach(d=>linhas.push(`  ${d.path?'[INCLUÍDO]':'[PENDENTE]'} ${d.title}`));
    linhas.push('');
  }
  const pendentes=documentos.filter(d=>d.aplicavel!==false&&!d.path&&d.status!=='gerado').length;
  linhas.push(pendentes?`ATENÇÃO: ${pendentes} item(ns) pendente(s) neste pacote.`:'Nenhuma pendência registrada neste pacote.');
  linhas.push('ATENÇÃO: confira o edital original, os documentos, os valores, as assinaturas e a validade na data da sessão antes do envio.');
  return linhas.join('\n');
}

function openModal(type,prefill={}){if(type==='balance')return openBalanceModal();if(type==='notice')return abrirWizard();const companyOptions=state.companies.map(c=>`<option value="${c.id}" ${c.id===state.profile?.companyId?'selected':''}>${esc(c.name)}</option>`).join(''),forms={company:{title:'Cadastrar empresa',html:`<div class="form-grid"><label class="full">CNPJ<div class="input-action"><input name="cnpj" required inputmode="numeric" maxlength="18" placeholder="00.000.000/0000-00"><button id="search-cnpj" class="secondary" type="button">Buscar dados</button></div><small id="cnpj-message" class="field-message">Consulta cadastral pela BrasilAPI. Confira os dados retornados.</small></label><label class="full">Razão social<input name="name" required></label><label>Nome fantasia<input name="trade"></label><label>Município<input name="city"></label><label>UF<input name="state" maxlength="2"></label><label>Data de abertura<input name="openingDate" type="date"></label><label>Porte<input name="size"></label><label class="full">Natureza jurídica<input name="legalNature"></label><label class="full">Linhas de fornecimento<textarea name="activities"></textarea></label></div>`},certificate:{title:'Adicionar certidão',html:`<div class="form-grid"><label class="full">Empresa<select name="companyId" required><option value="">Selecione</option>${companyOptions}</select></label><label>Tipo<select name="type" required>${certificateOptions()}</select></label><label>Órgão emissor<input name="issuer"></label><label>Emissão<input name="issued" type="date"></label><label>Validade<input name="validity" type="date" required></label><label class="full">Nome da pessoa (responsável técnico, representante legal...)<input name="responsavelTecnico" placeholder="Quando a certidão for de alguém específico, não da empresa"></label><label class="full">Arquivo original<input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg"></label></div>`},document:{title:'Cadastrar documento',html:`<div class="form-grid"><label class="full">Empresa<select name="companyId" required><option value="">Selecione</option>${companyOptions}</select></label><label class="full">Tipo no catálogo<select name="tipoChave" required>${opcoesCatalogo('',['balanco'])}</select><small class="field-message">É o tipo que decide se pede validade e como entra no acervo. Para balanço, use "Adicionar balanço".</small></label><label>Validade (quando houver)<input name="validity" type="date"></label><label class="full">Nome da pessoa (responsável técnico, representante legal...)<input name="responsavelTecnico" placeholder="Nome do profissional, quando o documento for dele"></label><label class="full">Arquivo<input name="file" type="file" required accept=".pdf,.png,.jpg,.jpeg"></label></div>${sociosSecaoHtml(prefill.tipoChave==='ato_constitutivo')}`}};if(type==='company'&&!isAdmin()){toast('Somente o administrador pode cadastrar empresas.');return false}if((type==='certificate'||type==='document')&&!state.companies.length){toast('Cadastre uma empresa primeiro.');return false}const f=forms[type];$('#modal-title').textContent=f.title;$('#modal-content').innerHTML=f.html;$('#modal').classList.remove('wide');if(prefill.companyId&&$('[name="companyId"]'))$('[name="companyId"]').value=prefill.companyId;if(prefill.tipoChave&&$('[name="tipoChave"]'))$('[name="tipoChave"]').value=prefill.tipoChave;if(type==='document'){sociosPendentes=[];renderSociosSecao()}const form=$('#modal-form');form.dataset.type=type;delete form.dataset.modo;delete form.dataset.registro;$('#modal').showModal();return true}
/* ---------------------------------------------------------------------------
   Edição do que já está cadastrado.

   Sem isto, uma certidão reconhecida errado só podia ser apagada e refeita, o
   que perdia o arquivo. O campo que mais importa aqui é o tipo do catálogo:
   é ele que decide a vigência e o casamento com as exigências do edital.
--------------------------------------------------------------------------- */
const REGISTROS_EDITAVEIS={certificate:'certidoes',document:'documentos_empresa',balance:'balancos'};
function opcoesCatalogo(atual,excluir=[]){
  const porBloco=new Map();
  Regras.catalogoDocumentos.filter(t=>!excluir.includes(t.chave)).forEach(t=>{
    const b=Regras.blocos[t.bloco]?.n||'Outros';
    if(!porBloco.has(b))porBloco.set(b,[]);
    porBloco.get(b).push(t);
  });
  return [...porBloco.entries()].map(([bloco,tipos])=>
    `<optgroup label="${esc(bloco)}">${tipos.map(t=>
      `<option value="${t.chave}"${t.chave===atual?' selected':''}>${esc(t.nome)}</option>`).join('')}</optgroup>`).join('');
}
const CATEGORIA_DO_BLOCO=Regras.categoriaDoBloco;
/* Cadastro de um documento avulso, de qualquer tipo do catálogo — o mesmo
   "Adicionar certidão" servia só para certidões; isto cobre o resto do
   acervo (societário, técnico, licenças...) sem passar pela importação em
   lote. Decide sozinho se o tipo escolhido é uma certidão (vai para a
   tabela de certidões, com o controle de validade que ela já tem) ou um
   documento comum. */
async function cadastrarDocumento(data,file){
  const tipo=Regras.tipoDocumento(data.tipoChave);
  if(tipo.chave==='balanco')throw new Error('Balanços têm cadastro próprio, com exercício e período — use "Adicionar balanço".');
  if(tipo.vigencia==='validade'&&!data.validity)throw new Error('Este tipo de documento tem validade e precisa dela preenchida.');
  if(tipo.certidao){
    const nome=tipo.certidao,folder=`certidoes/${safeFolder(nome)}/${(data.validity||Regras.hojeIso()).slice(0,4)}`,path=await uploadDocument(file,data.companyId,folder);
    const {error}=await client.from('certidoes').insert({empresa_id:data.companyId,tipo:nome,orgao_emissor:nome,
      validade:data.validity||null,tipo_chave:tipo.chave,responsavel_tecnico:data.responsavelTecnico||null,
      link_emissao:issuerLinks[nome]||null,arquivo_path:path,criado_por:state.user.id});
    if(error)throw error;
    return null;
  }
  const path=await uploadDocument(file,data.companyId,`acervo/${safeFolder(tipo.nome)}`);
  const {data:inserido,error}=await client.from('documentos_empresa').insert({empresa_id:data.companyId,tipo:tipo.nome,
    categoria:CATEGORIA_DO_BLOCO[tipo.bloco]||'Outros',tipo_chave:tipo.chave,validade:data.validity||null,
    responsavel_tecnico:data.responsavelTecnico||null,
    nome_original:file.name,data_documento:Regras.hojeIso(),arquivo_path:path,criado_por:state.user.id}).select('id').single();
  if(error)throw error;
  return inserido.id;
}
/* Persiste os sócios declarados junto com o Contrato social: envia ao Storage
   quem ainda não tinha arquivo e grava a lista completa no documento. */
async function salvarSociosDoDocumento(documentoId,companyId){
  const lista=[];
  for(const s of sociosPendentes){
    if(s.file?.size){
      const path=await uploadDocument(s.file,companyId,`acervo/socios/${safeFolder(s.nome)}`);
      lista.push({nome:s.nome,path,arquivoNome:s.file.name});
    }else lista.push({nome:s.nome,path:s.path||null,arquivoNome:s.arquivoNome||null});
  }
  const {error}=await client.from('documentos_empresa').update({socios:lista}).eq('id',documentoId);
  if(error)throw error;
}
function chaveAtualDe(entidade,r){
  if(r.tipoChave)return r.tipoChave;
  if(entidade==='balance')return'balanco';
  return Regras.classificarNoCatalogo(entidade==='certificate'
    ?{categoria:'Certidões',tipo:r.type,nome:r.type}
    :{categoria:r.category,tipo:r.type,nome:r.name});
}

/* Pré-visualização do arquivo (PDF ou imagem) por trás de uma signed URL —
   pra editar vendo o documento, em vez de confiar só no nome do arquivo. */
async function visualizarArquivo(path,container){
  if(!container)return;
  if(!path){container.innerHTML='<p class="empty">Sem arquivo anexado a este registro.</p>';return}
  container.innerHTML='<p class="empty">Carregando pré-visualização...</p>';
  try{
    const {data,error}=await client.storage.from('documentos').createSignedUrl(path,300);
    if(error)throw error;
    const ext=(path.split('.').pop()||'').toLowerCase();
    container.innerHTML=/^(png|jpe?g)$/.test(ext)
      ?`<img src="${esc(data.signedUrl)}" alt="Pré-visualização do arquivo">`
      :`<iframe src="${esc(data.signedUrl)}" title="Pré-visualização do arquivo"></iframe>`;
  }catch(error){container.innerHTML=`<p class="empty">Não foi possível abrir a pré-visualização: ${esc(friendlyError(error))}</p>`}
}

/* Sócios do Contrato social: só um campo pra declarar o quadro societário e,
   se já tiver, anexar o documento de identificação de cada um — nada de
   extração automática, sempre editado à mão e sempre visível para conferir. */
function sociosSecaoHtml(visivel){
  return `<div class="full socios-secao" data-socios-secao ${visivel?'':'hidden'}>
    <label class="full">Sócios
      <small class="field-message">Cadastre cada sócio do quadro societário e, quando tiver, anexe o documento de identificação dele.</small>
    </label>
    <ul id="socios-lista" class="socios-lista"></ul>
    <div class="socios-add">
      <input id="socio-novo-nome" placeholder="Nome do sócio">
      <input id="socio-novo-arquivo" type="file" accept=".pdf,.png,.jpg,.jpeg">
      <button type="button" id="adicionar-socio" class="secondary">Adicionar sócio</button>
    </div>
  </div>`;
}
function renderSociosSecao(){
  const cont=$('#socios-lista');
  if(!cont)return;
  cont.innerHTML=sociosPendentes.length?sociosPendentes.map((s,i)=>{
    const temDocumento=!!(s.file||s.path);
    return `<li class="socio-linha">
      <span>${esc(s.nome)}${s.file?` — <em>${esc(s.file.name)}</em>`:s.path?' — documento anexado':' — <em>sem documento anexado</em>'}</span>
      <span class="socio-linha-acoes">
        ${s.path&&!s.file?`<button type="button" class="link" data-document="${esc(s.path)}">Abrir</button>`:''}
        <label class="link-file">${temDocumento?'Trocar arquivo':'Anexar documento'}<input type="file" accept=".pdf,.png,.jpg,.jpeg" data-arquivo-socio="${i}" hidden></label>
        <button type="button" class="icon" data-remover-socio="${i}" title="Remover sócio">×</button>
      </span>
    </li>`;
  }).join(''):'<li class="empty">Nenhum sócio adicionado ainda.</li>';
}

/* Edição do que já está cadastrado. O tipo é travado no catálogo — nada de
   texto livre divergindo do que o catálogo diz que aquilo é, que foi
   exatamente o que deixou declaração entrando como ato constitutivo por aí. */
function openEditModal(entidade,id){
  const lista={certificate:state.certificates,document:state.documents,balance:state.balances}[entidade];
  const r=lista?.find(x=>x.id===id);
  if(!r){toast('Registro não localizado.');return false}
  const chave=chaveAtualDe(entidade,r);
  const catalogo=`<label class="full">Tipo no catálogo<select name="tipoChave">${opcoesCatalogo(chave)}</select>
    <small class="field-message">Decide como a vigência é calculada, com qual exigência do edital este documento casa e o nome do tipo — travado no catálogo, não digitado.</small></label>`;
  const troca=`<label class="full">Substituir arquivo (opcional)<input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg">
    <small class="field-message">Deixe vazio para manter o arquivo atual.</small></label>`;
  const responsavel=`<label class="full">Nome da pessoa (responsável técnico, representante legal...)<input name="responsavelTecnico" value="${esc(r.responsavelTecnico||'')}" placeholder="Nome do profissional, quando o documento for dele"></label>`;
  const formularios={
    certificate:{titulo:'Editar certidão',html:`<div class="form-grid">
      <label>Tipo<select name="type" required>${certificateOptions(r.type)}</select></label>
      <label>Órgão emissor<input name="issuer" value="${esc(r.issuer||'')}"></label>
      <label>Emissão<input name="issued" type="date" value="${esc(r.issued||'')}"></label>
      <label>Validade<input name="validity" type="date" value="${esc(r.validity||'')}" required></label>
      ${catalogo}${responsavel}${troca}</div>`},
    document:{titulo:'Editar documento do acervo',html:`<div class="form-grid">
      <label class="full">Tipo<input name="type" value="${esc(Regras.tipoDocumento(chave).nome)}" readonly>
        <small class="field-message">Segue o "Tipo no catálogo" abaixo — mude ali para mudar o tipo.</small></label>
      <label>Categoria<select name="category">${[...new Set([...archiveCategories,r.category].filter(Boolean))].map(c=>`<option${c===r.category?' selected':''}>${esc(c)}</option>`).join('')}</select></label>
      <label>Data do documento<input name="documentDate" type="date" value="${esc(r.documentDate||'')}"></label>
      <label>Validade<input name="validity" type="date" value="${esc(r.validity||'')}">
        <small class="field-message">Deixe vazio se o documento não vence.</small></label>
      ${catalogo}${responsavel}${troca}</div>${sociosSecaoHtml(chave==='ato_constitutivo')}`},
    balance:{titulo:'Editar balanço',html:`<div class="form-grid">
      <label>Exercício<input name="year" type="number" min="2000" max="${new Date().getFullYear()}" value="${esc(r.year||'')}" required></label>
      <label>Tipo<select name="documentType">${['Balanço anual','Balanço de abertura','Balanço intermediário'].map(t=>`<option${t===r.documentType?' selected':''}>${t}</option>`).join('')}</select></label>
      <label>Início do período<input name="periodStart" type="date" value="${esc(r.periodStart||'')}"></label>
      <label>Fim do período<input name="periodEnd" type="date" value="${esc(r.periodEnd||'')}" required></label>
      <label>Data do registro<input name="registrationDate" type="date" value="${esc(r.registrationDate||'')}"></label>
      <label>Órgão de registro<input name="registrationOffice" value="${esc(r.registrationOffice||'')}"></label>
      ${troca}</div>`}
  };
  const f=formularios[entidade];
  if(!f)return false;
  $('#modal-title').textContent=f.titulo;
  $('#modal-content').innerHTML=`<div class="modal-com-visualizador">${f.html}<div id="visualizador-arquivo" class="visualizador"></div></div>`;
  $('#modal').classList.add('wide');
  const form=$('#modal-form');
  form.dataset.type=entidade;
  form.dataset.modo='editar';
  form.dataset.registro=id;
  if(entidade==='document'){
    sociosPendentes=(r.socios||[]).map(s=>({nome:s.nome,path:s.path||null,arquivoNome:s.arquivoNome||null}));
    renderSociosSecao();
  }
  $('#modal').showModal();
  visualizarArquivo(r.filePath,$('#visualizador-arquivo'));
  return true;
}

/* Troca de arquivo: o caminho antigo pode estar vinculado a itens de checklist,
   então os vínculos acompanham a mudança em vez de apontar para o vazio. */
async function trocarArquivo(entidade,registro,file){
  const companyId=registro.companyId;
  const pasta={certificate:`certidoes/${safeFolder(registro.type||'certidao')}`,
    document:`acervo/${safeFolder(registro.category||'outros')}`,
    balance:`balancos/${registro.year||'sem-exercicio'}`}[entidade];
  const path=await uploadDocument(file,companyId,pasta);
  if(registro.filePath)
    await client.from('licitacao_checklist_itens')
      .update({documento_ref_path:path}).eq('documento_ref_path',registro.filePath);
  return path;
}

async function salvarEdicao(entidade,id,data,file){
  const lista={certificate:state.certificates,document:state.documents,balance:state.balances}[entidade];
  const registro=lista.find(x=>x.id===id);
  if(!registro)throw new Error('Registro não localizado.');
  const path=file?.size?await trocarArquivo(entidade,registro,file):null;
  const payloads={
    certificate:{tipo:data.type,orgao_emissor:data.issuer||null,emissao:data.issued||null,
      validade:data.validity,tipo_chave:data.tipoChave||null,responsavel_tecnico:data.responsavelTecnico||null,
      link_emissao:issuerLinks[data.type]||null},
    document:{tipo:data.type,categoria:data.category,data_documento:data.documentDate||null,
      validade:data.validity||null,tipo_chave:data.tipoChave||null,responsavel_tecnico:data.responsavelTecnico||null},
    balance:{exercicio:Number(data.year),tipo_documento:data.documentType,
      periodo_inicio:data.periodStart||null,periodo_fim:data.periodEnd,
      data_registro:data.registrationDate||null,orgao_registro:data.registrationOffice||null}
  };
  const payload={...payloads[entidade]};
  if(path)payload.arquivo_path=path;
  const {error}=await client.from(REGISTROS_EDITAVEIS[entidade]).update(payload).eq('id',id);
  if(error)throw error;
}

async function uploadDocument(file,companyId,folder){if(!file?.size)return null;if(file.size>50*1024*1024)throw new Error('O arquivo ultrapassa 50 MB.');const path=`${companyId}/${folder}/${id()}-${safeName(file.name)}`;const {error}=await client.storage.from('documentos').upload(path,file,{upsert:false});if(error)throw error;return path}

$('#auth-form').addEventListener('submit',async e=>{e.preventDefault();setBusy($('#login-btn'),true,'Entrando...');showAuthMessage('');const {error}=await client.auth.signInWithPassword({email:$('#auth-email').value.trim(),password:$('#auth-password').value});if(error)showAuthMessage(friendlyError(error));setBusy($('#login-btn'),false)});
$('#signup-btn').addEventListener('click',async()=>{const email=$('#auth-email').value.trim(),password=$('#auth-password').value,name=$('#auth-name').value.trim();if(!email||password.length<6||!name){showAuthMessage('Informe nome, e-mail e senha com pelo menos 6 caracteres.');return}setBusy($('#signup-btn'),true,'Criando...');const {data,error}=await client.auth.signUp({email,password,options:{data:{nome:name},emailRedirectTo:location.origin+location.pathname}});if(error)showAuthMessage(friendlyError(error));else if(data.session)await enterApp(data.user);else showAuthMessage('Cadastro criado. Confirme o e-mail para entrar.',true);setBusy($('#signup-btn'),false)});
$('#reset-btn').addEventListener('click',async()=>{const email=$('#auth-email').value.trim();if(!email){showAuthMessage('Informe seu e-mail.');return}const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});showAuthMessage(error?friendlyError(error):'Enviamos as instruções de recuperação.',!error)});
$('#logout-btn').addEventListener('click',()=>client.auth.signOut());$('#pending-logout').addEventListener('click',()=>client.auth.signOut());
$('#modal-form').addEventListener('submit',async e=>{
  e.preventDefault();
  // e.currentTarget só é válido durante o despacho síncrono do evento — depois
  // de um await, o navegador já zerou para null. Guarda o elemento aqui, no
  // início, e usa essa referência (formEl) daqui em diante, nunca mais
  // e.currentTarget. Foi isso que quebrava o "reset()" depois de qualquer
  // cadastro ou edição com upload de arquivo.
  const formEl=e.currentTarget;
  if(e.submitter?.value==='cancel'){$('#modal').close();formEl.reset();delete formEl.dataset.modo;delete formEl.dataset.registro;sociosPendentes=[];return}
  const button=$('#save-modal'),type=formEl.dataset.type,form=new FormData(formEl),data=Object.fromEntries(form),file=form.get('file');
  setBusy(button,true);
  try{
    if(formEl.dataset.modo==='editar'){
      await salvarEdicao(type,formEl.dataset.registro,data,file);
      if(type==='document'&&data.tipoChave==='ato_constitutivo'){
        const companyId=state.documents.find(d=>d.id===formEl.dataset.registro)?.companyId;
        await salvarSociosDoDocumento(formEl.dataset.registro,companyId);
      }
      $('#modal').close();formEl.reset();delete formEl.dataset.modo;delete formEl.dataset.registro;sociosPendentes=[];
      await loadData();toast('Registro atualizado.');setBusy(button,false);return;
    }
    if(type==='company'){const {error}=await client.from('empresas').insert({razao_social:data.name,nome_fantasia:data.trade||null,cnpj:data.cnpj,municipio:data.city||null,uf:data.state?.toUpperCase()||null,data_abertura:data.openingDate||null,natureza_juridica:data.legalNature||null,porte:data.size||null,atividades:data.activities||null});if(error)throw error}
    if(type==='certificate'){const folder=`certidoes/${safeFolder(data.type)}/${(data.issued||data.validity).slice(0,4)}`,path=await uploadDocument(file,data.companyId,folder),{error}=await client.from('certidoes').insert({empresa_id:data.companyId,tipo:data.type,orgao_emissor:data.issuer||null,emissao:data.issued||null,validade:data.validity,responsavel_tecnico:data.responsavelTecnico||null,link_emissao:issuerLinks[data.type]||null,arquivo_path:path,criado_por:state.user.id});if(error)throw error}
    if(type==='balance'){const path=await uploadDocument(file,data.companyId,`balancos/${data.year}`),{error}=await client.from('balancos').insert({empresa_id:data.companyId,exercicio:Number(data.year),tipo_documento:data.documentType,periodo_inicio:data.periodStart||null,periodo_fim:data.periodEnd,data_registro:data.registrationDate||null,orgao_registro:data.registrationOffice||null,arquivo_path:path,observacoes:data.notes||null,criado_por:state.user.id});if(error)throw error}
    if(type==='document'){
      const documentoId=await cadastrarDocumento(data,file);
      if(documentoId&&data.tipoChave==='ato_constitutivo'&&sociosPendentes.length)
        await salvarSociosDoDocumento(documentoId,data.companyId);
    }
    $('#modal').close();formEl.reset();lastPdfAnalysis=null;sociosPendentes=[];
    await loadData();toast('Registro salvo com sucesso.');
  }catch(error){toast(friendlyError(error))}
  finally{setBusy(button,false)}
});
$('#access-list').addEventListener('click',async e=>{const button=e.target.closest('[data-authorize]');if(!button)return;const userId=button.dataset.authorize,companyId=$(`[data-access-company="${userId}"]`).value;if(!companyId){toast('Selecione a empresa do proprietário.');return}setBusy(button,true);const {error}=await client.from('perfis').update({perfil:'proprietario_empresa',empresa_id:companyId}).eq('id',userId);if(error)toast(friendlyError(error));else{await loadData();toast('Proprietário autorizado.')}setBusy(button,false)});
document.body.addEventListener('click',async e=>{const path=e.target.closest('[data-document]')?.dataset.document;if(path){const {data,error}=await client.storage.from('documentos').createSignedUrl(path,120);if(error)toast(friendlyError(error));else window.open(data.signedUrl,'_blank','noopener')}const ed=e.target.closest('[data-editar]');if(ed){openEditModal(ed.dataset.editar,ed.dataset.editarId);return}const o=e.target.closest('[data-open]'),g=e.target.closest('[data-go]'),w=e.target.closest('[data-wizard]'),review=e.target.closest('[data-review-company]'),notice=e.target.closest('[data-notice-detail]'),trash=e.target.closest('[data-trash-entity]'),restore=e.target.closest('[data-restore-entity]'),remove=e.target.closest('[data-delete-entity]');if(o)openModal(o.dataset.open);if(g)navigate(g.dataset.go);if(w)abrirWizard(w.dataset.wizard);if(review){$('#review-company').value=review.dataset.reviewCompany;renderCompanyReview();navigate('review')}if(notice){state.selectedNoticeId=notice.dataset.noticeDetail;renderNoticeDetail();navigate('notice-detail')}if(trash)await moveToTrash(trash.dataset.trashEntity,trash.dataset.trashId);if(restore)await restoreFromTrash(restore.dataset.restoreEntity,restore.dataset.restoreId);if(remove)await permanentDelete(remove.dataset.deleteEntity,remove.dataset.deleteId)});
$('#modal-content').addEventListener('click',e=>{
  if(e.target.closest('#search-cnpj')){searchCnpj();return}
  if(e.target.closest('#adicionar-socio')){
    const nomeInput=$('#socio-novo-nome'),arquivoInput=$('#socio-novo-arquivo'),nome=nomeInput.value.trim();
    if(!nome){toast('Informe o nome do sócio.');return}
    sociosPendentes.push({nome,file:arquivoInput.files[0]||null});
    nomeInput.value='';arquivoInput.value='';
    renderSociosSecao();
    return;
  }
  const remSocio=e.target.closest('[data-remover-socio]');
  if(remSocio)sociosPendentes.splice(Number(remSocio.dataset.removerSocio),1),renderSociosSecao();
});
$('#modal-content').addEventListener('input',e=>{if(e.target.matches('[name="cnpj"]'))e.target.value=formatCnpj(e.target.value)});
$('#modal-content').addEventListener('change',e=>{
  if(e.target.matches('[name="tipoChave"]')){
    const tipoField=$('[name="type"]');
    if(tipoField?.readOnly)tipoField.value=Regras.tipoDocumento(e.target.value).nome;
    const secao=$('[data-socios-secao]');
    if(secao)secao.hidden=e.target.value!=='ato_constitutivo';
    return;
  }
  const arquivoSocio=e.target.closest('[data-arquivo-socio]');
  if(arquivoSocio){
    const i=Number(arquivoSocio.dataset.arquivoSocio),file=arquivoSocio.files[0];
    if(file&&sociosPendentes[i]){sociosPendentes[i]={...sociosPendentes[i],file};renderSociosSecao()}
  }
});
$('#analyze-certificates').addEventListener('click',analyzeCertificateBatch);
$('#reclassify-certificates').addEventListener('click',reclassifyImportedCertificates);
$('#batch-result').addEventListener('click',e=>{if(e.target.closest('#import-certificates'))importCertificateBatch()});
$('#batch-result').addEventListener('change',e=>{const row=e.target.closest('[data-batch-index]'),field=e.target.dataset.batchField;if(row&&field){pendingCertificates[Number(row.dataset.batchIndex)][field]=e.target.value;if(field==='type')renderPendingCertificates()}});
$('#analyze-archive').addEventListener('click',analyzeArchiveZip);
$('#archive-zip').addEventListener('change',()=>{if($('#archive-zip').files.length)$('#archive-folder').value=''});
$('#archive-folder').addEventListener('change',()=>{if($('#archive-folder').files.length)$('#archive-zip').value=''});
$('#archive-result').addEventListener('click',e=>{if(e.target.closest('#import-archive'))importArchive();if(e.target.closest('#download-duplicates'))downloadDuplicateReport()});
$('#archive-result').addEventListener('change',e=>{const row=e.target.closest('[data-archive-index]'),field=e.target.dataset.archiveField;if(row&&field){const item=pendingArchive[Number(row.dataset.archiveIndex)];item[field]=field==='include'?e.target.checked:e.target.value;if(field==='category'||field==='include')renderPendingArchive()}});
function filtroArchiveMudou(){vincularAberto=null;vincularSelecionado=null;renderArchive()}
$('#archive-filter').addEventListener('change',filtroArchiveMudou);$('#archive-view-company').addEventListener('change',filtroArchiveMudou);$('#organizar-acervo').addEventListener('click',organizarAcervo);
$('#archive-list').addEventListener('click',e=>{
  const abrir=e.target.closest('[data-vincular]');
  if(abrir){
    const chave=abrir.dataset.vincular;
    vincularAberto=vincularAberto===chave?null:chave;
    vincularSelecionado=null;
    renderArchive();
    return;
  }
  if(e.target.closest('[data-vincular-cancelar]')){vincularAberto=null;vincularSelecionado=null;renderArchive();return}
  const novo=e.target.closest('[data-vincular-novo]');
  if(novo){
    const chave=novo.dataset.vincularNovo,companyId=$('#archive-view-company')?.value||'';
    vincularAberto=null;vincularSelecionado=null;
    openModal('document',{companyId,tipoChave:chave});
    return;
  }
  const confirmar=e.target.closest('[data-vincular-confirmar]');
  if(confirmar){confirmarVinculo(confirmar.dataset.vincularConfirmar);return}
  const arquivar=e.target.closest('[data-arquivar]');
  if(arquivar)alternarArquivado(arquivar.dataset.arquivar,arquivar.dataset.arquivarValor==='true');
});
$('#archive-list').addEventListener('change',e=>{
  if(!e.target.matches('[data-vincular-select]'))return;
  vincularSelecionado=e.target.value||null;
  renderArchive();
});
$('#revisar-lote').addEventListener('click',abrirRevisaoLote);
$('#revisao-lote-empresa').addEventListener('change',renderRevisaoLote);
$('#revisao-lote-mostrar').addEventListener('change',renderRevisaoLote);
$('#revisao-lote-busca').addEventListener('input',renderRevisaoLote);
$('#revisao-lote-salvar').addEventListener('click',salvarRevisaoLote);
$('#revisao-lote-linhas').addEventListener('change',e=>{
  const campo=e.target.dataset.loteCampo;
  if(!campo)return;
  const tr=e.target.closest('tr'),origem=tr.dataset.origem,id=tr.dataset.id;
  const reg=registrosParaRevisao().find(r=>r.origem===origem&&r.id===id);
  if(!reg)return;
  const chaveMapa=`${origem}:${id}`,atual={...(loteEdicoes.get(chaveMapa)||{})};
  const original=campo==='tipoChave'?reg.chave:reg.validade,valor=e.target.value;
  if(valor===original)delete atual[campo];else atual[campo]=valor;
  if(Object.keys(atual).length)loteEdicoes.set(chaveMapa,atual);else loteEdicoes.delete(chaveMapa);
  renderRevisaoLote();
});
function fecharRevisaoLote(){
  if(loteEdicoes.size&&!confirm(`Descartar ${loteEdicoes.size} alteração(ões) não salva(s)?`))return;
  loteEdicoes=new Map();
  $('#revisao-lote').close();
}
$('#revisao-lote-fechar').addEventListener('click',fecharRevisaoLote);
$('#revisao-lote-cancelar').addEventListener('click',fecharRevisaoLote);
$('#revisao-guiada-abrir').addEventListener('click',abrirRevisaoGuiada);
$('#revisao-guiada-fechar').addEventListener('click',fecharRevisaoGuiada);
$('#revisao-guiada-empresa').addEventListener('change',filtroRevisaoGuiadaMudou);
$('#revisao-guiada-mostrar').addEventListener('change',filtroRevisaoGuiadaMudou);
$('#revisao-guiada-busca').addEventListener('input',filtroRevisaoGuiadaMudou);
$('#revisao-guiada-confirmar').addEventListener('click',confirmarRevisaoGuiada);
$('#revisao-guiada-pular').addEventListener('click',pularRevisaoGuiada);
$('#revisao-guiada-anterior').addEventListener('click',voltarRevisaoGuiada);
$('#revisao-guiada-lista').addEventListener('click',e=>{
  const item=e.target.closest('[data-guia-indice]');
  if(!item)return;
  const novoIndice=Number(item.dataset.guiaIndice);
  if(novoIndice===guiaIndice)return;
  if(revisaoGuiadaSuja()&&!confirm('Descartar as alterações deste documento e ir para o selecionado?'))return;
  guiaIndice=novoIndice;
  guiaEdicao=null;
  renderRevisaoGuiada();
});
$('#revisao-guiada-atual').addEventListener('change',e=>{
  const campo=e.target.id==='revisao-guiada-tipo'?'tipoChave':e.target.id==='revisao-guiada-validade'?'validade':null;
  if(!campo)return;
  const atual=registrosGuiados()[guiaIndice];
  if(!atual)return;
  const original=campo==='tipoChave'?atual.chave:atual.validade,valor=e.target.value;
  const novo={...(guiaEdicao||{})};
  if(valor===original)delete novo[campo];else novo[campo]=valor;
  guiaEdicao=Object.keys(novo).length?novo:null;
  renderRevisaoGuiada();
});
$('#check-balance').addEventListener('click',balanceGuidance);
$('#import-items').addEventListener('click',importItemsSpreadsheet);
$('#build-package').addEventListener('click',createProcessPackage);
document.body.addEventListener('click',e=>{const button=e.target.closest('[data-download-package]');if(button)downloadProcessPackage(button.dataset.downloadPackage);const pdfEdital=e.target.closest('[data-checklist-edital]');if(pdfEdital){const n=state.notices.find(x=>x.id===pdfEdital.dataset.checklistEdital),company=state.companies.find(c=>c.id===n?.companyId);if(n&&company)baixarChecklistPdf(company,n,documentosDoChecklist(n,state.checklist.filter(c=>c.noticeId===n.id).sort((a,b)=>(a.ordem??0)-(b.ordem??0))));else toast('Processo não localizado.')}const pdfBtn=e.target.closest('[data-checklist-pdf]');if(pdfBtn){const pkg=state.packages.find(p=>p.id===pdfBtn.dataset.checklistPdf),company=state.companies.find(c=>c.id===pkg?.companyId),notice=state.notices.find(n=>n.id===pkg?.noticeId);if(pkg&&company&&notice)baixarChecklistPdf(company,notice,pkg.documents);else toast('Pacote não localizado.')}const reg=e.target.closest('[data-adicionar-regularidade]');if(reg)openModal('document',{companyId:reg.dataset.adicionarEmpresa,tipoChave:reg.dataset.adicionarRegularidade})});
$('#export-btn').addEventListener('click',()=>{const backup={exportadoEm:new Date().toISOString(),empresas:state.companies,acervo:state.documents,certidoes:state.certificates,balancos:state.balances,licitacoes:state.notices,pacotes:state.packages},blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`licidoc-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href)});

function firstMatch(text,patterns){for(const pattern of patterns){const match=text.match(pattern);if(match?.[1])return match[1].replace(/\s+/g,' ').trim()}return''}
function brDateToIso(value){const m=value?.match(/(\d{2})\/(\d{2})\/(\d{4})/);return m?`${m[3]}-${m[2]}-${m[1]}`:''}
function detectNoticeList(text,rules){const found=[];rules.forEach(([regex,label])=>{if(regex.test(text))found.push(label)});return found}
function extractNoticeItems(text){const items=[];for(const line of text.split('\n')){const clean=line.replace(/\s+/g,' ').trim(),match=clean.match(/^(\d{1,4})[.\s-]+(.{8,180}?)\s+(UN|UND|UNID|KG|G|L|LT|M|M2|M²|M3|M³|CX|PCT|SERV|SV)\s+([\d.,]+)(?:\s+R?\$?\s*([\d.,]+))?$/i);if(match)items.push({item:match[1],descricao:match[2].trim(),unidade:match[3].toUpperCase(),quantidade:match[4],valor_unitario:match[5]||''});if(items.length>=500)break}return items}
function analyzeNoticeText(text,fileName,pages){const clean=text.replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n'),requirements=detectNoticeList(clean,[[/certid[aã]o.{0,80}(federal|fazenda nacional|d[ií]vida ativa)/i,'Certidão Federal/PGFN válida'],[/(regularidade.{0,50}fgts|certificado.{0,40}fgts|\bcrf\b)/i,'CRF/FGTS válido'],[/(certid[aã]o.{0,60}d[eé]bitos trabalhistas|\bcndt\b)/i,'CNDT válida'],[/certid[aã]o.{0,80}(estadual|fazenda estadual)/i,'Certidão Estadual válida'],[/certid[aã]o.{0,80}(municipal|fazenda municipal)/i,'Certidão Municipal válida'],[/(fal[eê]ncia.{0,50}recupera[cç][aã]o|certid[aã]o.{0,50}fal[eê]ncia)/i,'Certidão de falência e recuperação judicial'],[/(balan[cç]o patrimonial|demonstra[cç][oõ]es cont[aá]beis)/i,'Balanço patrimonial e demonstrações contábeis'],[/(atestado.{0,80}capacidade t[eé]cnica|qualifica[cç][aã]o t[eé]cnica)/i,'Atestado de capacidade técnica'],[/(amostra|prova de conceito)/i,'Verificar exigência de amostra ou prova de conceito'],[/(visita t[eé]cnica|vistoria pr[eé]via)/i,'Verificar exigência de visita técnica']]),proposalRequirements=detectNoticeList(clean,[[/validade\s+d[ao]\s+proposta/i,'Informar o prazo de validade da proposta'],[/(marca|fabricante|modelo)/i,'Informar marca, fabricante e modelo quando aplicável'],[/(pre[cç]o.{0,80}(impostos|frete|encargos|despesas))/i,'Declarar que tributos, frete, encargos e despesas estão incluídos nos preços'],[/(prazo.{0,40}(entrega|execu[cç][aã]o))/i,'Informar prazo de entrega ou execução'],[/(garantia.{0,60}(produto|objeto|servi[cç]o|meses))/i,'Informar prazo e condições de garantia'],[/(valor\s+unit[aá]rio|pre[cç]o\s+unit[aá]rio)/i,'Apresentar preço unitário'],[/(valor\s+total|pre[cç]o\s+total)/i,'Apresentar preço total por item e valor global'],[/(assinatura.{0,50}(representante|respons[aá]vel)|proposta.{0,80}assinad)/i,'Assinar a proposta pelo representante responsável']]),declarations=detectNoticeList(clean,[[/(inciso\s+xxxiii.{0,80}art.{0,20}7|menor.{0,80}(noturno|perigoso|insalubre))/i,'Declaração de cumprimento do art. 7º, XXXIII, da Constituição'],[/(inexist[eê]ncia.{0,50}fato.{0,30}impeditivo|fatos impeditivos)/i,'Declaração de inexistência de fatos impeditivos'],[/(microempresa|empresa de pequeno porte|\bme\/epp\b)/i,'Declaração de enquadramento como ME/EPP, quando aplicável'],[/(reserva.{0,40}cargos|pessoa com defici[eê]ncia|reabilitado da previd[eê]ncia)/i,'Declaração de cumprimento da reserva legal de cargos'],[/(elabora[cç][aã]o independente.{0,30}proposta)/i,'Declaração de elaboração independente da proposta'],[/(pleno conhecimento|aceita.{0,40}condi[cç][oõ]es.{0,30}edital)/i,'Declaração de pleno conhecimento e aceitação do edital'],[/(trabalho degradante|trabalho for[cç]ado)/i,'Declaração de não utilização de trabalho degradante ou forçado'],[/(vistoria|visita t[eé]cnica)/i,'Declaração de vistoria ou de conhecimento das condições, conforme o edital']]),items=extractNoticeItems(clean),object=firstMatch(clean,[/(?:^|\n)\s*(?:1[.\s-]*)?OBJETO\s*[:\-]?\s*([^\n]{20,700})/i,/objeto\s+d[ao]\s+(?:presente\s+)?(?:licita[cç][aã]o|certame)\s*[:\-]?\s*([^\n]{20,700})/i]),agency=firstMatch(clean,[/((?:PREFEITURA|MUNIC[IÍ]PIO|SECRETARIA|FUNDO|TRIBUNAL|C[ÂA]MARA|UNIVERSIDADE)[^\n]{3,100})/i]),modality=firstMatch(clean,[/\b(PREG[AÃ]O\s+ELETR[ÔO]NICO|CONCORR[ÊE]NCIA\s+ELETR[ÔO]NICA|DISPENSA\s+ELETR[ÔO]NICA|CHAMAMENTO\s+P[ÚU]BLICO|LEIL[AÃ]O)\b/i]),number=firstMatch(clean,[/(?:EDITAL|PREG[AÃ]O|CONCORR[ÊE]NCIA|DISPENSA)\s*(?:ELETR[ÔO]NIC[OA])?\s*(?:N[º°O.]*)?\s*([0-9.\/-]{3,30})/i])||fileName.replace(/\.pdf$/i,''),openingRaw=firstMatch(clean,[/(?:abertura|sess[aã]o p[úu]blica|in[ií]cio da sess[aã]o|recebimento das propostas)[^\n]{0,100}?(\d{2}\/\d{2}\/\d{4})/i]);return{fileName,pages,characters:clean.length,number,agency,object,modality,opening:brDateToIso(openingRaw),openingLabel:openingRaw,requirements,proposalRequirements,declarations,items,text:clean}}
function pdfContentToLines(items){const rows=new Map;items.forEach(item=>{const y=Math.round((item.transform?.[5]||0)/2)*2;if(!rows.has(y))rows.set(y,[]);rows.get(y).push({x:item.transform?.[4]||0,text:item.str})});return[...rows.entries()].sort((a,b)=>b[0]-a[0]).map(([,parts])=>parts.sort((a,b)=>a.x-b.x).map(x=>x.text).join(' ').replace(/\s+/g,' ').trim()).filter(Boolean).join('\n')}
async function extractPdfText(file,onProgress){if(!window.pdfjsLib)throw new Error('Biblioteca de leitura indisponível.');pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';const pdf=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;let text='';for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){onProgress?.(pageNumber,pdf.numPages);const page=await pdf.getPage(pageNumber),content=await page.getTextContent();text+=`\n\n--- Página ${pageNumber} ---\n${pdfContentToLines(content.items)}`}return{text,pages:pdf.numPages}}
async function extractPdf(file){const result=await extractPdfText(file,(page,pages)=>$('#pdf-progress').textContent=`Lendo página ${page} de ${pages}...`);return analyzeNoticeText(result.text,file.name,result.pages)}
function renderPdfAnalysis(a){const scanned=a.characters<Math.max(300,a.pages*80),list=(title,items)=>`<div class="analysis-list"><h3>${title}</h3>${items.length?`<ul class="requirements">${items.map(r=>`<li>${esc(r)}</li>`).join('')}</ul>`:'<p class="empty">Nenhum item localizado automaticamente.</p>'}</div>`;$('#pdf-result').innerHTML=`${scanned?'<div class="warning"><strong>Texto insuficiente.</strong> Este PDF pode precisar de OCR.</div>':''}<div class="analysis-grid"><div class="analysis-field"><small>Identificação</small><strong>${esc(a.number||'Não localizada')}</strong></div><div class="analysis-field"><small>Órgão</small><strong>${esc(a.agency||'Não localizado')}</strong></div><div class="analysis-field"><small>Modalidade</small><strong>${esc(a.modality||'Não localizada')}</strong></div><div class="analysis-field"><small>Abertura</small><strong>${esc(a.openingLabel||'Não localizada')}</strong></div><div class="analysis-field full"><small>Objeto</small><strong>${esc(a.object||'Não localizado automaticamente')}</strong></div></div><div class="analysis-columns">${list('Documentos e habilitação',a.requirements)}${list('Conteúdo da proposta de preços',a.proposalRequirements)}${list('Declarações localizadas',a.declarations)}</div><p><strong>${a.items.length}</strong> item(ns) de planilha reconhecido(s) no PDF. A tabela deve ser conferida ou substituída pela planilha XLS/XLSX do órgão.</p><div class="reader-actions"><button id="register-analysis" class="primary">Cadastrar edital com esta leitura</button><button id="toggle-preview" class="secondary">Ver texto extraído</button><small>${a.pages} página(s) · ${a.characters.toLocaleString('pt-BR')} caracteres</small></div><pre id="pdf-preview" class="text-preview" hidden>${esc(a.text.slice(0,20000))}</pre>`}
$('#read-pdf').addEventListener('click',async()=>{const file=$('#pdf-input').files[0];if(!file){toast('Selecione um arquivo PDF.');return}const progress=$('#pdf-progress');progress.hidden=false;progress.textContent='Abrindo o PDF...';setBusy($('#read-pdf'),true,'Lendo...');try{lastPdfAnalysis=await extractPdf(file);renderPdfAnalysis(lastPdfAnalysis);progress.textContent='Leitura concluída. Confira os dados.'}catch(error){progress.textContent=`Não foi possível ler: ${friendlyError(error)}`;lastPdfAnalysis=null}finally{setBusy($('#read-pdf'),false)}});
$('#pdf-result').addEventListener('click',e=>{if(e.target.id==='toggle-preview'){const preview=$('#pdf-preview');preview.hidden=!preview.hidden;e.target.textContent=preview.hidden?'Ver texto extraído':'Ocultar texto'}if(e.target.id==='register-analysis'&&lastPdfAnalysis)abrirWizard();
});
$('#nav').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b)navigate(b.dataset.view)});$('#company-search').addEventListener('input',renderCompanies);$('#certificate-filter').addEventListener('change',renderCertificates);$('#dashboard-company').addEventListener('change',renderCompanyDashboard);$('#review-company').addEventListener('change',renderCompanyReview);$('#open-company-review').addEventListener('click',()=>{const selected=$('#dashboard-company').value;if(selected)$('#review-company').value=selected;renderCompanyReview();navigate('review')});$('#back-to-notices').addEventListener('click',()=>navigate('notices'));$('#empty-trash').addEventListener('click',emptyTrash);
$('#notice-detail-content').addEventListener('click',e=>{
  const enviar=e.target.closest('[data-enviar-item]');
  if(enviar){itemUploadAberto=itemUploadAberto===enviar.dataset.enviarItem?null:enviar.dataset.enviarItem;renderNoticeDetail();return}
  const salvar=e.target.closest('[data-item-salvar]');
  if(salvar)salvarUploadItem(salvar.dataset.itemSalvar);
});
init();
