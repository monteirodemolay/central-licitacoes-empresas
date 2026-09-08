-- Balanço passa a ter validade, como as certidões: até quando ele vale depende
-- da forma de apresentação da empresa (regime tributário, se é auditado,
-- exigência do órgão) — não é algo que o sistema deduza sozinho, fica em
-- aberto para quem cadastra decidir. Execute uma vez; é seguro repetir.

alter table public.balancos add column if not exists validade date;
