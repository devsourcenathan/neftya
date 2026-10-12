-- L'adresse de la page de paiement, conservée avec la tentative.
--
-- Deux clics sur « Payer » doivent revenir à la **même** page, pas en ouvrir
-- une seconde. Sans cette colonne, il aurait fallu rappeler le fournisseur —
-- et NotchPay refuse une référence déjà employée, si bien que le second clic
-- aurait rendu une erreur au lieu de la page attendue.
--
-- Elle ne vaut que le temps d'une tentative : les pages hébergées expirent
-- d'elles-mêmes, et une ligne réglée n'y renvoie plus.
ALTER TABLE payments
    ADD COLUMN redirect_url text;
