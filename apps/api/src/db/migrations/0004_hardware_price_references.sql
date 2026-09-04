-- Les prix orphelins du catalogue de quincaillerie.
--
-- Le 2 septembre 2026, les articles de quincaillerie ont cessé d'être des familles pour
-- devenir des références de catalogue : `accessory:hinge` est devenu
-- `accessory:hinge_35_110`, parce qu'un perçage n'existe pas pour « une charnière » mais
-- pour une charnière donnée.
--
-- Les prix déjà saisis sont restés sur les anciennes clés, donc invisibles au devis. Le
-- symptôme était honnête — la ligne s'affichait « à saisir » — mais il demandait de
-- ressaisir ce qui l'avait déjà été.
--
-- Trois renommages sont **exacts** : un ancien article, un nouveau. Ils se reportent.

UPDATE material_prices
SET reference  = 'accessory:hinge_35_110',
    updated_at = now()
WHERE reference = 'accessory:hinge'
  -- Une organisation qui aurait déjà saisi la nouvelle référence garde la sienne : c'est
  -- la plus récente, et elle a été saisie en connaissance du changement.
  AND NOT EXISTS (
      SELECT 1 FROM material_prices AS existing
      WHERE existing.organization_id = material_prices.organization_id
        AND existing.reference = 'accessory:hinge_35_110'
  );

UPDATE material_prices
SET reference  = 'accessory:dowel_8x30',
    updated_at = now()
WHERE reference = 'accessory:dowel_8'
  AND NOT EXISTS (
      SELECT 1 FROM material_prices AS existing
      WHERE existing.organization_id = material_prices.organization_id
        AND existing.reference = 'accessory:dowel_8x30'
  );

UPDATE material_prices
SET reference  = 'accessory:shelf_support_5',
    updated_at = now()
WHERE reference = 'accessory:shelf_support'
  AND NOT EXISTS (
      SELECT 1 FROM material_prices AS existing
      WHERE existing.organization_id = material_prices.organization_id
        AND existing.reference = 'accessory:shelf_support_5'
  );

-- Ce qui reste orphelin, et pourquoi on n'y touche pas.
--
-- `accessory:drawer_slide_pair` valait pour « une paire de coulisses », sans longueur. Il
-- correspond maintenant à six références — `slide_ball_250` à `slide_ball_500` — et une
-- coulisse de 250 ne coûte pas ce que coûte une de 500. Recopier le même montant sur les
-- six inventerait cinq tarifs, ce qui est précisément ce que le changement de référence
-- visait à empêcher.
--
-- La ligne est donc laissée en place : elle ne sert plus au devis, elle ne gêne rien, et
-- elle garde la trace du montant que l'organisation avait retenu. Les longueurs se
-- saisissent une par une, et le devis dit lesquelles manquent.
--
-- Même raisonnement pour les poignées, qui n'ont jamais eu d'ancienne référence.
