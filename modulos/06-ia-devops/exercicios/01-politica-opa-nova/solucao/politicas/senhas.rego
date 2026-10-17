# Política nova da plataforma: senhas geradas pelo IaC precisam ser fortes.
# Roda sobre o JSON do `tofu plan` (mesma entrada do exemplo 01).
package main

import rego.v1

senhas contains rc if {
	some rc in input.resource_changes
	rc.type == "random_password"
	some acao in rc.change.actions
	acao in {"create", "update"}
}

deny contains msg if {
	some rc in senhas
	rc.change.after.length < 32
	msg := sprintf("%s: length %d é curto; a plataforma exige length >= 32", [rc.address, rc.change.after.length])
}

deny contains msg if {
	some rc in senhas
	rc.change.after.special == false
	msg := sprintf("%s: special = false; a plataforma exige caracteres especiais", [rc.address])
}
