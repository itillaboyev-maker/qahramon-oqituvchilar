-- Fix: move Tashkent Region districts from TAS (city) to TA (region)

UPDATE districts
SET region_id = (
    SELECT id
    FROM regions
    WHERE code = 'TA'
)
WHERE code IN (
'TAS_NUR_C',
'TAS_ANG_C',
'TAS_BEK_C',
'TAS_CHR_C',
'TAS_OHA_C',
'TAS_YNL_C',
'TAS_OQQ_D',
'TAS_OHA_D',
'TAS_BEK_R',
'TAS_BOS_D',
'TAS_BOK_D',
'TAS_ZAN_D',
'TAS_QIB_D',
'TAS_QUY_D',
'TAS_PAR_D',
'TAS_PIS_D',
'TAS_ORT_D',
'TAS_CHN_D',
'TAS_YUQ_D',
'TAS_YNL_D',
'TAS_TOS_D'
);