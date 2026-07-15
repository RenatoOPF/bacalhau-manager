-- Numeração de pedidos passou a reiniciar ao fechar o caixa (chave fixa 'current'),
-- e não mais por dia. Remove as linhas antigas com chave por data (ex.: '2026-07-15').
DELETE FROM "DailyCounter" WHERE "date" <> 'current';
