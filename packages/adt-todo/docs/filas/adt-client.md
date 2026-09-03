# Fila adt-client

- [ ] 1. Spike node-rfc - canal de compatibilidade para ECC antigo (ate 4.6C)
> bloqueado: aguardando um sistema-alvo REAL sem SOAP RFC (probe com soapRfc:false - ECC pre-Web AS 6.20 ou no SICF fechado por seguranca). Decisao com o Joris 2026-08-26: S4H 758 e SXD 816 tem todos os canais, entao o spike nao provaria nada que o SOAP ja nao prova; e o node-rfc custa caro (lib arquivada pela SAP 05/2026, SDK restrito por S-user, DLL nativa). Estado medido: SDK ausente na maquina (sem sapnwrfc.dll, SAPNWRFC_HOME vazio). Quando desbloquear: SDK 7.50 em C:\nwrfcsdk + SAPNWRFC_HOME, npm i node-rfc, ping/readTable contra o sistema-alvo, receita canal-node-rfc.md.

- [ ] 2. Auth BTP/SAML no wdi5 (I10) - a receita so mediu on-premise Basic > cookie. Provaria: o canal wdi5 em cloud. Medir: depende de um tenant BTP com Fiori acessivel.
> bloqueado: sem tenant BTP

- [ ] 3. Conversor Adobe - a escada portada para XFA/XDP (I35) - herda a metodologia do item 42 sobre o clone do item 41 (GET_LAYOUT( )->SET_LAYOUT_DATA no XDP). Provaria: a prancheta HTML imprimindo via ADS - o alvo final da I35. Medir: o mesmo loop do item 42, com XFA no lugar do SSFO e o PDF vindo do ADS.
> alvo: regra do Joris, 2026-08-31: mede no sxd 816:100, nao no s4h - o s4h nao tem ADS, e la a falha vem disfarcada (CX_FP_API_INTERNAL sem detalhe na copia do FORM, item 41). Vale para todo item de Adobe Form que toque o ADS (render, copia/criacao do FORM, I48); Smart Form e a copia da INTERFACE continuam no s4h. Tabela em receita-forms.md § Em qual sistema medir. A janela de disponibilidade do SXD e 09:00-24:00 SP (registro canônico: docs/landscape.md).
> sondado 2026-09-03 06:54 SP: sonda do SXD 816:100 (http://172.31.28.129:8000) falhou — timeout em 8011ms. NOTA: às 06:54 está FORA da janela 09:00-24:00 SP do SXD, então o timeout era esperado (a disponibilidade do SXD é a janela da regra do Joris). Sem rede/VPN e sem credenciais nesta sessao (prototipo simulado, sem .sessao.json).
> bloqueado até 2026-09-03 09:00: fora da janela 09:00-24:00 SP do SXD; sonda do SXD 816:100 retomada automaticamente na abertura da janela (09:00 SP). Se responder, rodar a escada do item 42 com XFA/SFPF/ADS (imprimir a prancheta HTML via ADS — alvo final da I35).
