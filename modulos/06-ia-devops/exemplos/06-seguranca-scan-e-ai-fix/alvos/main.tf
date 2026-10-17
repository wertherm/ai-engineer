# IaC com problemas PLANTADOS para o scanner achar (nunca aplique isto).
resource "aws_s3_bucket" "relatorios" {
  bucket = "ngt-relatorios-estudo"
}

resource "aws_s3_bucket_public_access_block" "relatorios" {
  bucket                  = aws_s3_bucket.relatorios.id
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_security_group" "bastion" {
  name        = "bastion"
  description = "acesso ssh"

  ingress {
    description = "ssh do mundo"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
