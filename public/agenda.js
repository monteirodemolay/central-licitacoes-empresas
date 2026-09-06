/* Agenda de interesse: acompanha os editais que a empresa quer disputar mesmo
   sem ter toda a documentação pronta, com contagem regressiva até a sessão e as
   providências a tomar até lá. Depende dos globais de app.js e de Regras. */
(function(){
'use strict';

const INTERESSES=[
  {v:'em_analise',n:'Em análise',cor:'pendente'},
  {v:'vamos_participar',n:'Vamos participar',cor:'ok'},
  {v:'sem_interesse',n:'Sem interesse',cor:'nao_aplicavel'},
  {v:'participamos',n:'Já participamos',cor:'gerado'}
];
const PRIORIDADES=[{v:'alta',n:'Alta'},{v:'media',n:'Média'},{v:'baixa',n:'Baixa'}];
const hoje=()=>new Date().toISOString().slice(0,10);
const diasAte=iso=>iso?Regras.diasEntre(hoje(),iso):null;
const rotuloInteresse=v=>INTERESSES.find(x=>x.v===v)?.n||'Em análise';
const corInteresse=v=>INTERESSES.find(x=>x.v===v)?.cor||'pendente';

/* Prazo sugerido: uma folga antes da sessão, para dar tempo de emitir e conferir. */
const FOLGA_DIAS=5;
function prazoSugerido(notice){
  if(!notice.opening)return null;
  const d=new Date(`${notice.opening}T12:00:00`);
  d.setDate(d.getDate()-FOLGA_DIAS);
  const iso=d.toISOString().slice(0,10);
  return iso<hoje()?hoje():iso;
}

/* Lança pendências do checklist na agenda, sem duplicar o que já está aberto. */
async function agendarPendencias(notice,pendencias){
  if(!notice.id||!pendencias?.length)return 0;
  const abertas=new Set(state.agenda
    .filter(t=>t.noticeId===notice.id&&!t.concluida)
    .map(t=>t.titulo));
  const novas=pendencias.filter(p=>!abertas.has(p.titulo));
  if(!novas.length)return 0;
  const prazo=prazoSugerido(notice);
  const linhas=novas.map(p=>({empresa_id:notice.companyId,licitacao_id:notice.id,
    titulo:p.titulo,detalhe:p.texto||null,prazo,responsavel:notice.responsavel||null,
    origem:'checklist',criado_por:state.user.id}));
  const {error}=await client.from('agenda_tarefas').insert(linhas);
  if(error)throw error;
  return linhas.length;
}

/* --------------------------------------------------------------------------
   Cálculo da agenda
-------------------------------------------------------------------------- */
function resumoDoProcesso(notice){
  const itens=state.checklist.filter(c=>c.noticeId===notice.id&&c.aplicavel!==false);
  const resumo=Regras.contar(itens);
  const tarefas=state.agenda.filter(t=>t.noticeId===notice.id&&!t.concluida);
  const prontidao=resumo.total?Math.round((resumo.prontos/resumo.total)*100):null;
  return {itens,resumo,tarefas,prontidao,dias:diasAte(notice.opening)};
}

function processosDaAgenda(){
  const filtro=$('#agenda-filtro')?.value||'ativos';
  return state.notices.filter(n=>{
    if(filtro==='todos')return true;
    if(filtro==='vamos_participar')return n.interesse==='vamos_participar';
    if(filtro==='em_analise')return (n.interesse||'em_analise')==='em_analise';
    // ativos: o que ainda pode ser disputado
    if(n.interesse==='sem_interesse'||n.interesse==='participamos')return false;
    const d=diasAte(n.opening);
    return n.opening==null||d==null||d>=0;
  }).sort((a,b)=>{
    const pa=a.prioridade==='alta'?0:a.prioridade==='baixa'?2:1;
    const pb=b.prioridade==='alta'?0:b.prioridade==='baixa'?2:1;
    return (a.opening||'9999-12-31').localeCompare(b.opening||'9999-12-31')||pa-pb;
  });
}

function tarefasAbertas(){
  return state.agenda.filter(t=>!t.concluida)
    .sort((a,b)=>(a.prazo||'9999-12-31').localeCompare(b.prazo||'9999-12-31'));
}

/* --------------------------------------------------------------------------
   Render
-------------------------------------------------------------------------- */
function renderAgenda(){
  const raiz=$('#agenda-processos');
  if(!raiz)return;
  const lista=processosDaAgenda();
  renderAgendaMetricas();
  raiz.innerHTML=lista.length?lista.map(cardProcesso).join(''):
    '<div class="empty">Nenhum edital nesta situação. Cadastre um edital pelo assistente e marque o interesse.</div>';
  renderProvidencias();
}

function renderAgendaMetricas(){
  const alvo=$('#agenda-metricas');
  if(!alvo)return;
  const ativos=processosDaAgenda();
  const confirmados=ativos.filter(n=>n.interesse==='vamos_participar');
  const tarefas=tarefasAbertas();
  const atrasadas=tarefas.filter(t=>t.prazo&&t.prazo<hoje());
  const proximo=ativos.find(n=>n.opening&&diasAte(n.opening)>=0);
  alvo.innerHTML=`
    <div class="metric"><span>Vamos participar</span><strong>${confirmados.length}</strong><small>de ${ativos.length} em acompanhamento</small></div>
    <div class="metric${atrasadas.length?' red':''}"><span>Providências atrasadas</span><strong>${atrasadas.length}</strong><small>prazo já vencido</small></div>
    <div class="metric${tarefas.length?' amber':''}"><span>Providências abertas</span><strong>${tarefas.length}</strong><small>documentação a resolver</small></div>
    <div class="metric"><span>Próxima sessão</span><strong>${proximo?diasAte(proximo.opening):'—'}</strong><small>${proximo?`dia(s) · ${esc(proximo.number)}`:'nenhuma sessão marcada'}</small></div>`;
}

function cardProcesso(n){
  const r=resumoDoProcesso(n);
  const urgente=r.dias!=null&&r.dias>=0&&r.dias<=7;
  const vencido=r.dias!=null&&r.dias<0;
  const barra=r.prontidao==null?'':`
    <div class="ag-barra" title="${r.resumo.prontos} de ${r.resumo.total} itens prontos">
      <div class="ag-barra-fill${r.prontidao>=100?' full':r.prontidao>=60?' meio':''}" style="width:${r.prontidao}%"></div>
    </div>
    <small>${r.resumo.prontos} de ${r.resumo.total} documentos prontos${r.tarefas.length?` · ${r.tarefas.length} providência(s)`:''}</small>`;
  return `<article class="card ag-card${urgente?' urgente':''}" data-agenda-notice="${n.id}">
    <div class="card-head">
      <div>
        <h3>${esc(n.number)}</h3>
        <p>${esc(companyName(n.companyId))} · ${esc(n.agency)}</p>
      </div>
      <span class="badge ${corInteresse(n.interesse)}">${esc(rotuloInteresse(n.interesse))}</span>
    </div>
    <p class="ag-objeto">${esc((n.object||'').slice(0,220))}${(n.object||'').length>220?'…':''}</p>
    <div class="ag-linha">
      <span class="ag-prazo${vencido?' vencido':urgente?' urgente':''}">
        ${n.opening?(vencido?`Sessão em ${fmt(n.opening)} — já passou`:`${r.dias} dia(s) · sessão ${fmt(n.opening)}${n.horaSessao?` às ${esc(n.horaSessao.slice(0,5))}`:''}`):'Sem data de sessão'}
      </span>
      ${n.prioridade==='alta'?'<span class="badge vencido">Prioridade alta</span>':''}
      ${n.responsavel?`<span class="ag-resp">${esc(n.responsavel)}</span>`:''}
    </div>
    ${barra}
    ${r.tarefas.length?`<details class="ag-tarefas"><summary>${r.tarefas.length} providência(s) em aberto</summary>
      ${r.tarefas.map(linhaTarefa).join('')}</details>`:''}
    ${n.anotacoes?`<p class="ag-nota">${esc(n.anotacoes)}</p>`:''}
    <div class="ag-acoes">
      <label>Interesse<select data-interesse="${n.id}">${INTERESSES.map(i=>`<option value="${i.v}"${(n.interesse||'em_analise')===i.v?' selected':''}>${esc(i.n)}</option>`).join('')}</select></label>
      <label>Prioridade<select data-prioridade="${n.id}">${PRIORIDADES.map(i=>`<option value="${i.v}"${(n.prioridade||'media')===i.v?' selected':''}>${esc(i.n)}</option>`).join('')}</select></label>
      <button class="secondary" data-abrir-wizard="${n.id}">Abrir assistente</button>
      ${r.resumo.criticos?`<button class="link" data-agendar-pendencias="${n.id}">Lançar pendências na agenda</button>`:''}
      <button class="link" data-nova-tarefa="${n.id}">＋ Providência</button>
    </div>
  </article>`;
}

function linhaTarefa(t){
  const atrasada=t.prazo&&t.prazo<hoje();
  const dias=diasAte(t.prazo);
  return `<div class="ag-tarefa${atrasada?' atrasada':''}">
    <input type="checkbox" data-concluir="${t.id}"${t.concluida?' checked':''}>
    <div>
      <strong>${esc(t.titulo)}</strong>
      ${t.detalhe?`<small>${esc(t.detalhe)}</small>`:''}
      <small class="ag-tarefa-meta">${t.prazo?`${atrasada?'Atrasada desde':'Até'} ${fmt(t.prazo)}${!atrasada&&dias!=null?` · ${dias} dia(s)`:''}`:'Sem prazo'}${t.responsavel?` · ${esc(t.responsavel)}`:''}${t.noticeId?` · ${esc(numeroDoProcesso(t.noticeId))}`:''}</small>
    </div>
    <button class="link" data-excluir-tarefa="${t.id}" title="Remover providência">×</button>
  </div>`;
}

const numeroDoProcesso=noticeId=>state.notices.find(n=>n.id===noticeId)?.number||'processo';

function renderProvidencias(){
  const alvo=$('#agenda-providencias');
  if(!alvo)return;
  const tarefas=tarefasAbertas();
  if(!tarefas.length){
    alvo.innerHTML='<div class="empty">Nenhuma providência em aberto. As pendências do checklist podem ser lançadas aqui pelo assistente ou pelo botão do processo.</div>';
    return;
  }
  const limite=new Date();limite.setDate(limite.getDate()+7);
  const fimSemana=limite.toISOString().slice(0,10);
  const grupos=[
    {t:'Atrasadas',itens:tarefas.filter(x=>x.prazo&&x.prazo<hoje()),cls:'atrasado'},
    {t:'Próximos 7 dias',itens:tarefas.filter(x=>x.prazo&&x.prazo>=hoje()&&x.prazo<=fimSemana),cls:'urgente'},
    {t:'Mais adiante',itens:tarefas.filter(x=>x.prazo&&x.prazo>fimSemana),cls:''},
    {t:'Sem prazo definido',itens:tarefas.filter(x=>!x.prazo),cls:''}
  ].filter(g=>g.itens.length);
  alvo.innerHTML=grupos.map(g=>`<div class="ag-grupo ${g.cls}">
    <h3>${esc(g.t)}<span>${g.itens.length}</span></h3>
    ${g.itens.map(linhaTarefa).join('')}</div>`).join('');
}

/* --------------------------------------------------------------------------
   Eventos
-------------------------------------------------------------------------- */
async function atualizarLicitacao(id,campos){
  const {error}=await client.from('licitacoes').update(campos).eq('id',id);
  if(error){toast(friendlyError(error));return}
  await loadData();
}

async function novaTarefa(noticeId){
  const notice=state.notices.find(n=>n.id===noticeId);
  if(!notice)return;
  const titulo=prompt('O que precisa ser providenciado?');
  if(!titulo?.trim())return;
  const sugerido=prazoSugerido(notice)||'';
  const prazo=prompt('Até quando? (AAAA-MM-DD, vazio para sem prazo)',sugerido);
  if(prazo===null)return;
  const {error}=await client.from('agenda_tarefas').insert({
    empresa_id:notice.companyId,licitacao_id:notice.id,titulo:titulo.trim(),
    prazo:/^\d{4}-\d{2}-\d{2}$/.test(prazo)?prazo:null,
    responsavel:notice.responsavel||null,origem:'manual',criado_por:state.user.id});
  if(error){toast(friendlyError(error));return}
  await loadData();
  toast('Providência adicionada.');
}

function ligarEventos(){
  const view=document.getElementById('agenda');
  if(!view||view.dataset.ligado)return;
  view.dataset.ligado='1';

  view.addEventListener('change',async e=>{
    const t=e.target;
    if(t.id==='agenda-filtro'){renderAgenda();return}
    if(t.dataset.interesse){await atualizarLicitacao(t.dataset.interesse,{interesse:t.value});return}
    if(t.dataset.prioridade){await atualizarLicitacao(t.dataset.prioridade,{prioridade:t.value});return}
    if(t.dataset.concluir){
      const concluida=t.checked;
      const {error}=await client.from('agenda_tarefas')
        .update({concluida,concluida_em:concluida?new Date().toISOString():null,atualizado_em:new Date().toISOString()})
        .eq('id',t.dataset.concluir);
      if(error){toast(friendlyError(error));return}
      await loadData();
      toast(concluida?'Providência concluída.':'Providência reaberta.');
    }
  });

  view.addEventListener('click',async e=>{
    const b=e.target.closest('button');
    if(!b)return;
    if(b.dataset.abrirWizard){abrirWizard(b.dataset.abrirWizard);return}
    if(b.dataset.novaTarefa){await novaTarefa(b.dataset.novaTarefa);return}
    if(b.dataset.excluirTarefa){
      const {error}=await client.from('agenda_tarefas').delete().eq('id',b.dataset.excluirTarefa);
      if(error){toast(friendlyError(error));return}
      await loadData();
      toast('Providência removida.');
      return;
    }
    if(b.dataset.agendarPendencias){
      const notice=state.notices.find(n=>n.id===b.dataset.agendarPendencias);
      if(!notice)return;
      setBusy(b,true,'Lançando...');
      try{
        const itens=state.checklist.filter(c=>c.noticeId===notice.id&&c.aplicavel!==false);
        const critica=Regras.criticarProcesso(processoDaLicitacao(notice),itens,{});
        const criadas=await agendarPendencias(notice,critica.pendencias);
        await loadData();
        toast(criadas?`${criadas} providência(s) na agenda.`:'Todas as pendências já estavam na agenda.');
      }catch(error){toast(friendlyError(error))}
      finally{setBusy(b,false)}
    }
  });
}

document.addEventListener('DOMContentLoaded',ligarEventos);
if(document.readyState!=='loading')ligarEventos();

window.renderAgenda=renderAgenda;
window.agendarPendencias=agendarPendencias;
window.resumoDoProcesso=resumoDoProcesso;
window.prazoSugerido=prazoSugerido;
window.rotuloInteresse=rotuloInteresse;
window.corInteresse=corInteresse;
})();
