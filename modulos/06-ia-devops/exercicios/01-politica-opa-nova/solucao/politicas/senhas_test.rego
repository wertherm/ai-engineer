# Testes da política (rodam com `conftest verify`): política sem teste é política que quebra calada.
package main

import rego.v1

plano(length, special) := {"resource_changes": [{
	"address": "random_password.db",
	"type": "random_password",
	"change": {"actions": ["create"], "after": {"length": length, "special": special}},
}]}

test_senha_curta_negada if {
	some msg in deny with input as plano(16, true)
	contains(msg, "length 16")
}

test_sem_especiais_negada if {
	some msg in deny with input as plano(40, false)
	contains(msg, "special = false")
}

test_senha_forte_aprovada if {
	count(deny) == 0 with input as plano(32, true)
}

# Recurso que só vai ser lido/destruído não é avaliado.
test_delete_ignorado if {
	entrada := {"resource_changes": [{
		"address": "random_password.velha", "type": "random_password",
		"change": {"actions": ["delete"], "after": null},
	}]}
	count(deny) == 0 with input as entrada
}
