-- Sistema importado do GitHub pode entrar sem endereço publicado (só o código é monitorado até informar a URL).
ALTER TABLE sistema ALTER COLUMN url DROP NOT NULL;
