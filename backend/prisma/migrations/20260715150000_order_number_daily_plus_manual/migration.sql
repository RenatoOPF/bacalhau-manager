-- Numeração de pedidos voltou a reiniciar por dia (fecha o caixa sozinho na
-- virada do dia), mantendo o fechamento manual. Cada dia usa sua própria chave
-- no DailyCounter, então a linha fixa 'current' (do fechamento só-manual) não é
-- mais usada — remove para não ficar lixo.
DELETE FROM "DailyCounter" WHERE "date" = 'current';
