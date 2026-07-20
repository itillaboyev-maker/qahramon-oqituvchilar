-- Fix incorrect Toshkent region/district mapping
-- Move Toshkent viloyati districts from TAS to TA

UPDATE districts
SET region_id = (
    SELECT id FROM regions WHERE code = 'TA'
)
WHERE code IN (
'TAS_ANG_C',
'TAS_BEK_C',
'TAS_BEK_R',
'TAS_BOS_D',
'TAS_BOK_D',
'TAS_ZAN_D',
'TAS_OQQ_D',
'TAS_OHA_C',
'TAS_OHA_D',
'TAS_OLM_C',
'TAS_PAR_D',
'TAS_PIS_D',
'TAS_QIB_D',
'TAS_QUY_D',
'TAS_CHR_C',
'TAS_CHN_D',
'TAS_ORT_D',
'TAS_YNL_C',
'TAS_YNL_D',
'TAS_YUQ_D',
'TAS_TOS_D'
);