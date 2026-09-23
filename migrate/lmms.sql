UNLOAD TO 'si_ind_mast.txt' DELIMITER '|'
    SELECT i_membership_no, i_acct_type, i_park_off, i_accpac_ref, i_subs_cat, i_name,
           i_salutation, i_name_card, i_ic_pass_no, i_new_ic, i_nationality, i_birthdate,
           i_sex, i_race, i_marital_status, i_email, i_tel_res, i_handphone,
           i_add1, i_add2, i_add3, i_city_state, i_postcode, i_statecode,
           i_mailadd1, i_mailadd2, i_mailadd3, i_mail_city_state, i_mail_postcode, i_mail_statecode,
           i_work_nature, i_company1, i_comp_add1, i_comp_add2, i_comp_add3,
           i_telno_off, i_designation, i_spouse, i_spouse_ic, i_spouse_new_ic,
           i_ja_name, i_ja_ic, i_ja_new_ic, i_ja_salutation, i_ja_designation, i_ja_name_card,
           i_ja_add1, i_ja_add2, i_ja_add3, i_ja_city, i_ja_postcode, i_ja_state,
           i_ja_tel_h, i_ja_tel_o, i_ja_hp, i_ja_email,
           i_enrol_rci, i_active_hcm, i_remark, i_sysdate, i_mod_date,
           i_comp_city_state, i_comp_postcode, i_comp_statecode, i_telno_off2, i_faxno_off
    FROM si_ind_mast WHERE i_cocode IN ('03', '15', '02');

    UNLOAD TO 'si_cor_mast.txt' DELIMITER '|'
    SELECT c_membership_no, c_park_off, c_accpac_ref, c_subs_cat, c_company1,
           c_registration_no, c_incorporation, c_business_nature,
           c_regadd1, c_regadd2, c_regadd3, c_city_state, c_postcode, c_statecode,
           c_mailadd1, c_mailadd2, c_mailadd3, c_mail_city_state, c_mail_postcode, c_mail_statecode,
           c_telno1, c_telno2, c_faxno, c_email,
           c_enrol_rci, c_active_hcm, c_sysdate, c_mod_date
    FROM si_cor_mast WHERE c_cocode IN ('03', '15', '02');

    UNLOAD TO 'si_entitlement.txt' DELIMITER '|'
    SELECT e_membership_no, e_agreement_no, e_agreement_date, e_enddate, e_rtu_years,
           e_cocode, e_enttype, e_agreement_type, e_member_type, e_total_pts,
           e_acct_classify, e_purchase_price, e_down, e_sub_fees, e_sink_fund, e_govt_tax,
           e_loan_amt, e_loan_type, e_sls_br, e_sls_mth, e_sls_source,
           e_certificate_no, e_transfer_flag, e_ttmembership_no, e_tfmembership_no,
           e_nom1_name, e_nom1_ic, e_nom1_new_ic,
           e_nom1_salutation, e_nom1_designation, e_nom1_name_card,
           e_nom1_tel_h, e_nom1_tel_hp,
           e_nom1_add1, e_nom1_add2, e_nom1_add3, e_nom1_city_state, e_nom1_postcode, e_nom1_email,
           e_nom2_name, e_nom2_ic, e_nom2_new_ic, e_nom2_salutation, e_nom2_designation,
           e_nom2_name_card, e_nom2_tel_h, e_nom2_tel_hp,
           e_nom2_add1, e_nom2_add2, e_nom2_add3, e_nom2_city_state, e_nom2_postcode, e_nom2_email,
           e_nom2_email,
           e_rci_refno, e_rci_enrol_date, e_rci_expiry_date, e_rci_fee_paid,  -- NOT imported (see below)
           e_outstd_doc, e_doc_desc, e_locality, e_can_code, e_sysdate, e_mod_date,
           e_term_user, e_aterm_date, e_tfdate, e_ttdate, e_tfuser, e_ttuser,
           e_loc_name, e_loc_salutation, e_loc_designation, e_loc_name_card, e_cse_code
    FROM si_entitlement WHERE e_cocode IN ('03', '15', '02');
    -- The four e_rci_* columns above are still exported but no longer imported: RCI data
    -- lives in RciEnrolment (rci_enrol.txt) alone. Kept in the SELECT so the column
    -- offsets migrate-informix.ts parses stay unchanged.

    UNLOAD TO 'csp_mast.txt' DELIMITER '|'
    SELECT csp_code, csp_name, csp_branch, csp_status
    FROM csp_mast;

    UNLOAD TO 'amc_mem.txt' DELIMITER '|'
    SELECT mem_no, agmt_no, cocode, first_due, next_due, last_invdate,
           no_of_inv, ttl_inv, price_code, date_create
    FROM amc_mem WHERE cocode IN ('03', '15');

    UNLOAD TO 'ps_amc_mem.txt' DELIMITER '|'
    SELECT psamc_memno, psamc_agmtno, psamc_cocode, psamc_first_due, psamc_next_due,
           psamc_last_invdate, psamc_no_of_inv, psamc_ttl_inv, psamc_datecreate
    FROM ps_amc_mem WHERE psamc_cocode = '02';

    UNLOAD TO 'maa_mem.txt' DELIMITER '|'
    SELECT * FROM maa_mem WHERE cocode IN ('03', '15');

    UNLOAD TO 'maa_claim.txt' DELIMITER '|'
    SELECT * FROM maa_claim;

    UNLOAD TO 'rci_enrol.txt' DELIMITER '|'
    SELECT * FROM rci_enrol;
    -- Full table (43 cols) since 2026-08-20. This supersedes the old 29-col SELECT
    -- joined against si_entitlement; migrate-rci-enrolment.ts detects the layout from
    -- the field count. It is now the ONLY reader of this file.

    UNLOAD TO 'rci_week.txt' DELIMITER '|'
    SELECT * FROM rci_week;
    -- Full table. The importer keeps only years >= 2026 (209 of 2,055).

    UNLOAD TO 'bulk_bank.txt' DELIMITER '|'
    SELECT * FROM bulk_bank;
    -- Full table. The importer keeps only check-in years >= 2026 (771 of 35,928),
    -- matching migrate-rci-week.ts's MIN_YEAR.

    UNLOAD TO 'booking_ent1.txt' DELIMITER '|'
    SELECT * FROM booking_ent1;

    UNLOAD TO 'ps_bookent1.txt' DELIMITER '|'
    SELECT * FROM ps_bookent1;

    UNLOAD TO 'ctrl_billtab.txt' DELIMITER '|'
    SELECT cocode, last_amcinv FROM ctrl_billtab WHERE cocode IN ('03', '15', '02');

    UNLOAD TO 'ps_company.txt' DELIMITER '|'
    SELECT * FROM ps_company;

    UNLOAD TO 'lvc_master.txt' DELIMITER '|'
    SELECT * FROM lvc_master;

    UNLOAD TO 'resort_mast.txt' DELIMITER '|'
    SELECT * FROM resort_mast;

    UNLOAD TO 'ps_resort_info.txt' DELIMITER '|'
    SELECT * FROM ps_resort_info;

    UNLOAD TO 'apt_category.txt' DELIMITER '|'
    SELECT aptc_resort_code, aptc_type, aptc_remark, aptc_lock_type FROM apt_category;

    -- apt_mast / apt_block / resmt are NOT plain SELECTs any more. Four resorts had
    -- their unit registers trimmed to the live inventory (L-10024 Greenhill A1-A34,
    -- L-10025 Golden City B1-B22, L-10026 Leisure Cove floors 4-5, CP-PBR Perdana
    -- the 32xx family), and all three tables must carry the SAME unit whitelist or a
    -- refresh reloads blocks/maintenance for units that no longer exist.
    -- Run these three scripts instead of hand-writing the UNLOADs:
    --     dbaccess <db> E:\Websites\lmms\migrate\apt_mast_unload.sql     -> apt_mast.txt
    --     dbaccess <db> E:\Websites\lmms\migrate\apt_block_unload.sql    -> apt_block.txt
    --     dbaccess <db> E:\Websites\lmms\migrate\resmt_unload.sql        -> resmt.txt
    -- Expected: 358 / 2191 / 10904 rows.

    -- OPTIONAL, and recommended: the active-resorts sweep. Exports every resort
    -- OTHER than those four that is Active in resort_mast, so no active resort can
    -- end up without its units. migrate-resort-units.ts loads it when the file is
    -- present and de-duplicates against apt_mast.txt on (resortCode, unitNo); when
    -- absent it is skipped and the refresh proceeds normally.
    --     dbaccess <db> E:\Websites\lmms\migrate\apt_mast_active_unload.sql
    --                                                        -> apt_mast_active.txt

    UNLOAD TO 'res_avail_mast.txt' DELIMITER '|'
    SELECT * FROM res_avail_mast;

    UNLOAD TO 'ps_seasondate.txt' DELIMITER '|'
    SELECT * FROM ps_seasondate where year(pssd_seadate) >= 2026;

    UNLOAD TO 'ps_seasonapt.txt' DELIMITER '|'
    SELECT * FROM ps_seasonapt where pssa_resort_code = "CP-PBR";

    UNLOAD TO 'ps_lvcapt.txt' DELIMITER '|'
    SELECT * FROM ps_lvcapt;
