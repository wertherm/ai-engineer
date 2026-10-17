# Processo de deploy

Deploys em produção acontecem de segunda a quinta, entre 10h e 16h. Sexta-feira, fim de semana e véspera de feriado são dias de congelamento: só correções de incidente entram.

Todo deploy passa pelo pipeline Esteira, que roda testes unitários, testes de contrato e um smoke test em homologação. Se qualquer etapa falhar, o deploy é bloqueado automaticamente.

O rollback é feito com o comando `esteira rollback <servico>` e precisa ser comunicado no canal #incidentes em até 10 minutos.
