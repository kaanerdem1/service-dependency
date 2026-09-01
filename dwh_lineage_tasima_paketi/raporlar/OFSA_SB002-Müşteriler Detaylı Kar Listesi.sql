SELECT /*+ parallel (4) */
           MUSTERI_KARLILIK.CREATE_DATE,
           MUSTERI_KARLILIK.TARIH,
           TO_CHAR (MUSTERI_KARLILIK.MUSTERI_NO),
           MUSTERI_KARLILIK.MUSTERI_ADI,
           TO_CHAR (MUSTERI_KARLILIK.SUBE_KODU),
           MUSTERI_KARLILIK.SUBE_ADI,
           MUSTERI_KARLILIK.BOLGE_ADI,
           MUSTERI_KARLILIK.BOLGE_KODU,
           MUSTERI_KARLILIK.ISKOLU,
           MUSTERI_KARLILIK.SEGMENT,
           TO_CHAR (MUSTERI_KARLILIK.MT_SICIL),
           MUSTERI_KARLILIK.MT_ADI,
           TO_CHAR (MUSTERI_KARLILIK.URUN_KODU),
           MUSTERI_KARLILIK.URUN,
           MUSTERI_KARLILIK.PARA_BIRIMI,
           MUSTERI_KARLILIK.AYLK_KRS_ONC_NET_KAR_IRR,
           MUSTERI_KARLILIK.KRS_ONC_NET_KAR_IRR,
           MUSTERI_KARLILIK.AYLK_KRS_ONC_NET_KAR_LNR,
           MUSTERI_KARLILIK.KRS_ONC_NET_KAR_LNR,
           MUSTERI_KARLILIK.AYLK_FAALIYET_KARI_IRR,
           MUSTERI_KARLILIK.FAALIYET_KARI_IRR,
           MUSTERI_KARLILIK.AYLK_FAALIYET_KARI_LNR,
           MUSTERI_KARLILIK.FAALIYET_KARI_LNR,
           MUSTERI_KARLILIK.AYLK_PERFORMANS_KARI_IRR,
           MUSTERI_KARLILIK.PERFORMANS_KARI_IRR,
           MUSTERI_KARLILIK.AYLK_PERFORMANS_KARI_LNR,
           MUSTERI_KARLILIK.PERFORMANS_KARI_LNR,
           MUSTERI_KARLILIK.AYRILAN_KARSILIK_SEPET2,
           MUSTERI_KARLILIK.AYRILAN_KARSILIK_SEPET3,
           MUSTERI_KARLILIK.AYRILAN_KARSILIK_TOPLAM,
           MUSTERI_KARLILIK.FAIZ_GELIRI_IRR_KRD,
           MUSTERI_KARLILIK.FAIZ_GELIRI_IRR_KK,
           MUSTERI_KARLILIK.TOP_FAIZ_GELIRI_IRR,
           MUSTERI_KARLILIK.FAIZ_GEL_LINEER_KRD,
           MUSTERI_KARLILIK.FAIZ_GEL_LINEER_KK,
           MUSTERI_KARLILIK.TOP_FAIZ_GELIRI_LINEER,
           MUSTERI_KARLILIK.FAIZ_GDR_IRR_MVD,
           MUSTERI_KARLILIK.FAIZ_GDR_LINEER_MVD,
           MUSTERI_KARLILIK.FAIZ_GDR_GM_BLNC,
           MUSTERI_KARLILIK.FAIZ_GDR_DIGER,
           MUSTERI_KARLILIK.TOP_FAIZ_GDR_IRR,
           MUSTERI_KARLILIK.TOP_FAIZ_GDR_LINEER,
           MUSTERI_KARLILIK.FON_GETIRI_MVD_BLK,
           MUSTERI_KARLILIK.FON_GETIRI_GM_BLNC,
           MUSTERI_KARLILIK.POS_BLK_GELIRI,
           MUSTERI_KARLILIK.TOP_FONLAMA_GETIRI,
           MUSTERI_KARLILIK.FONLAMA_MLY_KRD,
           MUSTERI_KARLILIK.FONLAMA_MLY_KK,
           MUSTERI_KARLILIK.VADE_BOZUM_KAR_ZARAR,
           MUSTERI_KARLILIK.KASA_FONLAMA_TL,
           MUSTERI_KARLILIK.KASA_FONLAMA_YP,
           MUSTERI_KARLILIK.TOP_FONLAMA_MALIYETI,
           MUSTERI_KARLILIK.FAIZ_DISI_GELIR_BHG,
           MUSTERI_KARLILIK.FAIZ_DISI_GELIR_KRD,
           MUSTERI_KARLILIK.FAIZ_DISI_GELIR_KK,
           MUSTERI_KARLILIK.FAIZ_DISI_GELIR_DGR,
           MUSTERI_KARLILIK.FX_KAR_ZARAR,
           MUSTERI_KARLILIK.POS_KOM_GLR_UIY_BEDELI,
           MUSTERI_KARLILIK.POS_KOM_GEL_KIRA,
           MUSTERI_KARLILIK.POS_KOM_GEL_UIY_KATKI,
           MUSTERI_KARLILIK.POS_KOM_GEL_SERVIS_BEDELI,
           MUSTERI_KARLILIK.POS_KOM_GEL_TOP,
           MUSTERI_KARLILIK.SKYTRM_HALKA_ARZ_KOM,
           MUSTERI_KARLILIK.SKYTRM_FON_VRM,
           MUSTERI_KARLILIK.SKYTRM_HISSE_KOM,
           MUSTERI_KARLILIK.SKYTRM_SGMK_VERIM,
           MUSTERI_KARLILIK.SKYTRM_SWEET_KOM,
           MUSTERI_KARLILIK.SKYTRM_VOB_KOM,
           MUSTERI_KARLILIK.SKYTRM_SUBE_KULL_PAYI,
           MUSTERI_KARLILIK.SKYTRM_TOPLAM,
           MUSTERI_KARLILIK.TOP_FAIZ_DISI_GELIR,
           MUSTERI_KARLILIK.FDGDR_ISLETME,
           MUSTERI_KARLILIK.FDGDR_PERSONEL,
           MUSTERI_KARLILIK.FDGDR_VERGI,
           MUSTERI_KARLILIK.FDGDR_AMORTISMAN,
           MUSTERI_KARLILIK.FDGDR_DAVA_MHKM,
           MUSTERI_KARLILIK.FDGDR_VERILEN_KOM,
           MUSTERI_KARLILIK.FDGDR_DESMER,
           MUSTERI_KARLILIK.POS_KOM_GDR,
           MUSTERI_KARLILIK.TOP_FAIZ_DISI_GIDER,
           MUSTERI_KARLILIK.SUBE_KIRA_BEDELI,
           MUSTERI_KARLILIK.GM_MASRAF_PAYI,
           MUSTERI_KARLILIK.MUNZAM_MALIYETI,
           MUSTERI_KARLILIK.VADESIZ_MEVDUAT_PRIM,
           MUSTERI_KARLILIK.SEKERKUR_ALT_FW_DCD_PRIM,
           MUSTERI_KARLILIK.VADELI_MEV_PRIM,
           MUSTERI_KARLILIK.SKLEASING_ISLEM_YON_KOM,
           MUSTERI_KARLILIK.DIS_TICARET_PRIM,
           MUSTERI_KARLILIK.NAKIT_YONETIM_PRIM,
           MUSTERI_KARLILIK.KUL_KAY_HATALI_ISL_MLYT,
           MUSTERI_KARLILIK.EFT_KAP_SAAT_SON_EK_UCRT,
           MUSTERI_KARLILIK.KULLANILMAYAN_IZIN_MLYT,
           MUSTERI_KARLILIK.YATIRIM_EKSTRE_UCRETI,
           MUSTERI_KARLILIK.FON_YON_FX_ISLM_IPT_CZA,
           MUSTERI_KARLILIK.HATALI_ISLEM_MLYT,
           MUSTERI_KARLILIK.HAZINE_BONO_PRIMLERI,
           MUSTERI_KARLILIK.GMENKUL_PRIMI,
           MUSTERI_KARLILIK.AYRILAN_KARSILIK_SEPET1,
           MUSTERI_KARLILIK.HASAT_POS_BLOKE_GELIRI,
           MUSTERI_KARLILIK.FONLAMA_GETIRI_KK_ALACAK_BKY,
           nvl(MUSTERI_KARLILIK.PRIVATE_BRANCH_FLAG,0)  as   PRIVATE_BRANCH_FLAG,
           MUSTERI_KARLILIK.GECICI_GOREV_MALIYETI,
           MUSTERI_KARLILIK.PASIF_TEKLIF_ORANI_CEZASI,
           MUSTERI_KARLILIK.PASIF_BAYI_ORANI_CEZASI,
           MUSTERI_KARLILIK.SEKAR
      FROM (  SELECT a.as_of_date
                         AS TARIH,
                     a.create_date
                         AS CREATE_DATE,
                     TO_CHAR (a.mus_no)
                         AS MUSTERI_NO,
                     a.mus_adi
                         AS MUSTERI_ADI,
                     LPAD (a.sube_kodu, 3, 0)
                         AS SUBE_KODU,
                     a.sube_adi
                         AS SUBE_ADI,
                     a.bolge_adi
                         AS BOLGE_ADI,
                     TO_CHAR (A.BOLGE_KODU)
                         AS BOLGE_KODU,
                     a.iskolu
                         AS ISKOLU,
                     a.segment
                         AS SEGMENT,
                     a.mt_sicil
                         AS MT_SICIL,
                     a.mt_adi
                         AS MT_ADI,
                     a.urun_kodu
                         AS URUN_KODU,
                     a.urun
                         AS URUN,
                     a.para_birimi
                         AS PARA_BIRIMI,
                     --------------------------------------------------
                     SUM (a.aylik_krslk_oncs_net_kar_irr)
                         AS AYLK_KRS_ONC_NET_KAR_IRR,
                     SUM (a.karsilik_oncesi_net_kar_irr)
                         AS KRS_ONC_NET_KAR_IRR,
                     SUM (a.aylik_krslk_oncs_net_kar_lnr)
                         AS AYLK_KRS_ONC_NET_KAR_LNR,
                     SUM (a.karsilik_oncesi_net_kar_lnr)
                         AS KRS_ONC_NET_KAR_LNR,
                     SUM (a.aylik_faaliyet_kari_irr)
                         AS AYLK_FAALIYET_KARI_IRR,
                     SUM (a.faaliyet_kari_irr)
                         AS FAALIYET_KARI_IRR,
                     SUM (a.aylik_faaliyet_kari_lineer)
                         AS AYLK_FAALIYET_KARI_LNR,
                     SUM (a.faaliyet_kari_lineer)
                         AS FAALIYET_KARI_LNR,
                     SUM (a.AYLIK_PERFORMANS_KARI_IRR)
                         AS AYLK_PERFORMANS_KARI_IRR,
                     SUM (a.performans_kari_irr)
                         AS PERFORMANS_KARI_IRR,
                     SUM (a.AYLIK_PERFORMANS_KARI_LINEER)
                         AS AYLK_PERFORMANS_KARI_LNR,
                     SUM (a.performans_kari_lineer)
                         AS PERFORMANS_KARI_LNR,
                     SUM (a.ayrilan_kars_sepet1)
                         AS AYRILAN_KARSILIK_SEPET1,
                     SUM (a.ayrilan_kars_sepet2)
                         AS AYRILAN_KARSILIK_SEPET2,
                     SUM (a.ayrilan_kars_sepet3)
                         AS AYRILAN_KARSILIK_SEPET3,
                     SUM (a.ayrilan_kars_toplam)
                         AS AYRILAN_KARSILIK_TOPLAM,
                     --------------------------------------------------
                     SUM (a.faiz_geliri_irr_kredi)
                         AS FAIZ_GELIRI_IRR_KRD,
                     SUM (a.faiz_geliri_irr_kk)
                         AS FAIZ_GELIRI_IRR_KK,
                     SUM (a.toplam_faiz_geliri_irr)
                         AS TOP_FAIZ_GELIRI_IRR,
                     SUM (a.faiz_geliri_lineer_kredi)
                         AS FAIZ_GEL_LINEER_KRD,
                     SUM (a.faiz_geliri_lineer_kk)
                         AS FAIZ_GEL_LINEER_KK,
                     SUM (a.toplam_faiz_geliri_lineer)
                         AS TOP_FAIZ_GELIRI_LINEER,
                     --------------------------------------------------
                     SUM (a.faiz_gideri_irr_mevd)
                         AS FAIZ_GDR_IRR_MVD,
                     SUM (a.faiz_gideri_lineer_mevd)
                         AS FAIZ_GDR_LINEER_MVD,
                     SUM (a.faiz_gideri_gm_bilanco)
                         AS FAIZ_GDR_GM_BLNC,
                     SUM (a.faiz_gideri_diger)
                         AS FAIZ_GDR_DIGER,
                       SUM (a.faiz_gideri_irr_mevd)
                     + SUM (a.faiz_gideri_gm_bilanco)
                     + SUM (a.faiz_gideri_diger)
                         AS TOP_FAIZ_GDR_IRR,
                       SUM (a.faiz_gideri_lineer_mevd)
                     + SUM (a.faiz_gideri_gm_bilanco)
                     + SUM (a.faiz_gideri_diger)
                         AS TOP_FAIZ_GDR_LINEER,
                     --------------------------------------------------
                     SUM (a.fonlama_getiri_mevd_bloke)
                         AS FON_GETIRI_MVD_BLK,
                     SUM (a.fonlama_getiri_gm_bilanco)
                         AS FON_GETIRI_GM_BLNC,
                     SUM (a.pos_bloke_geliri)
                         AS POS_BLK_GELIRI,
                     SUM (a.toplam_fonlama_getiri)
                         AS TOP_FONLAMA_GETIRI,
                     SUM (a.fonlama_maliyeti_kredi)
                         AS FONLAMA_MLY_KRD,
                     SUM (a.fonlama_maliyeti_kk)
                         AS FONLAMA_MLY_KK,
                     SUM (a.VADE_BOZUM_KAR_ZARAR)
                         AS VADE_BOZUM_KAR_ZARAR,
                     SUM (a.kasa_fonlama_tl)
                         AS KASA_FONLAMA_TL,
                     SUM (a.kasa_fonlama_yp)
                         AS KASA_FONLAMA_YP,
                     SUM (a.toplam_fonlama_maliyeti)
                         AS TOP_FONLAMA_MALIYETI,
                     --------------------------------------------------
                     SUM (a.faiz_disi_gelir_bhg)
                         AS FAIZ_DISI_GELIR_BHG,
                     SUM (a.faiz_disi_gelir_kredi)
                         AS FAIZ_DISI_GELIR_KRD,
                     SUM (a.faiz_disi_gelir_kk)
                         AS FAIZ_DISI_GELIR_KK,
                     SUM (a.faiz_disi_gelir_diger)
                         AS FAIZ_DISI_GELIR_DGR,
                     SUM (a.fx_kar_zarar)
                         AS FX_KAR_ZARAR,
                     SUM (a.pos_kom_gel_isyeri_bedeli)
                         AS POS_KOM_GLR_UIY_BEDELI,
                     SUM (a.pos_kom_gel_kira_bedeli)
                         AS POS_KOM_GEL_KIRA,
                     SUM (a.pos_kom_gel_uye_is_katki)
                         AS POS_KOM_GEL_UIY_KATKI,
                     SUM (a.pos_kom_gel_servis_bedeli)
                         AS POS_KOM_GEL_SERVIS_BEDELI,
                     SUM (a.pos_kom_gel_toplam)
                         AS POS_KOM_GEL_TOP,
                     SUM (a.skyatirim_halka_arz_kom)
                         AS SKYTRM_HALKA_ARZ_KOM,
                     SUM (a.skyatirim_fon_verim)
                         AS SKYTRM_FON_VRM,
                     SUM (a.skyatirim_hisse_kom)
                         AS SKYTRM_HISSE_KOM,
                     SUM (a.skyatirim_sgmk_verim)
                         AS SKYTRM_SGMK_VERIM,
                     SUM (a.skyatirim_sweet_kom)
                         AS SKYTRM_SWEET_KOM,
                     SUM (a.skyatirim_vob_kom)
                         AS SKYTRM_VOB_KOM,
                     SUM (a.SKYATIRIM_SUBE_KULL_PAYI)
                         AS SKYTRM_SUBE_KULL_PAYI,
                     SUM (a.skyatirim_toplam)
                         AS SKYTRM_TOPLAM,
                     SUM (a.toplam_faiz_disi_gelir)
                         AS TOP_FAIZ_DISI_GELIR,
                     SUM (a.faiz_disi_gider_isletme)
                         AS FDGDR_ISLETME,
                     SUM (a.faiz_disi_gider_personel)
                         AS FDGDR_PERSONEL,
                     SUM (a.faiz_disi_gider_vergi)
                         AS FDGDR_VERGI,
                     SUM (a.faiz_disi_gider_amortistman)
                         AS FDGDR_AMORTISMAN,
                     SUM (a.faiz_disi_gider_dava_mhk)
                         AS FDGDR_DAVA_MHKM,
                     SUM (a.faiz_disi_gider_verilen_kom)
                         AS FDGDR_VERILEN_KOM,
                     SUM (a.faiz_disi_gider_desmer)
                         AS FDGDR_DESMER,
                     SUM (a.pos_kom_gideri)
                         AS POS_KOM_GDR,
                     SUM (a.toplam_faiz_disi_gider)
                         AS TOP_FAIZ_DISI_GIDER,
                     SUM (a.sube_kira_bedeli)
                         AS SUBE_KIRA_BEDELI,
                     --------------------------------------------------
                     SUM (a.gm_masraf_payi)
                         AS GM_MASRAF_PAYI,
                     --------------------------------------------------
                     SUM (a.munzam_maliyeti)
                         AS MUNZAM_MALIYETI,
                     SUM (a.HAZINE_BONO_PRIMLERI)
                         AS HAZINE_BONO_PRIMLERI,
                     SUM (a.VADESIZ_MEVDUAT_PRIM)
                         AS VADESIZ_MEVDUAT_PRIM,
                     SUM (a.SEKERKUR_ALT_FW_DCD_PRIM)
                         AS SEKERKUR_ALT_FW_DCD_PRIM,
                     SUM (a.VADELI_MEV_PRIM)
                         AS VADELI_MEV_PRIM,
                     SUM (a.SKLEASING_ISLEM_YON_KOM)
                         AS SKLEASING_ISLEM_YON_KOM,
                     SUM (a.DIS_TICARET_PRIM)
                         AS DIS_TICARET_PRIM,
                     SUM (a.NAKIT_YONETIM_PRIM)
                         AS NAKIT_YONETIM_PRIM,
                     SUM (a.KUL_KAY_HATALI_ISL_MALIYET)
                         AS KUL_KAY_HATALI_ISL_MLYT,
                     SUM (a.EFT_KAP_SAATI_SON_EK_UCRETI)
                         AS EFT_KAP_SAAT_SON_EK_UCRT,
                     SUM (a.KULLANILMAYAN_IZIN_MALIYETI)
                         AS KULLANILMAYAN_IZIN_MLYT,
                     SUM (a.YATIRIM_EKSTRE_UCRETI)
                         AS YATIRIM_EKSTRE_UCRETI,
                     SUM (a.FON_YON_FX_ISLEM_IPTAL_CEZA)
                         AS FON_YON_FX_ISLM_IPT_CZA,
                     SUM (a.HATALI_ISLEM_MALIYETI)
                         AS HATALI_ISLEM_MLYT,
                     SUM (a.GMENKUL_PRIMI)
                         AS GMENKUL_PRIMI,
                     SUM (a.subede_bekleyen_cek_ve_kartlar)
                         AS subede_bekleyen_cek_ve_kartlar,
                     SUM (a.HASAT_POS_BLOKE_GELIRI)
                         AS HASAT_POS_BLOKE_GELIRI,
                     SUM(FONLAMA_GETIRI_KK_ALACAK_BKY) AS FONLAMA_GETIRI_KK_ALACAK_BKY,
                     PRIVATE_BRANCH_FLAG,
                     sum(A.GECICI_GOREV_MALIYETI) as GECICI_GOREV_MALIYETI,
                     sum(A.PASIF_TEKLIF_ORANI_CEZASI) as PASIF_TEKLIF_ORANI_CEZASI,
                     sum(nvl(A.PASIF_BAYI_ORANI_CEZASI,0)) as PASIF_BAYI_ORANI_CEZASI   ,
                     sum(nvl(SUBEDE_BEKLEYEN_CEK_VE_KARTLAR,0)) as SUBEDE_BEKLEYEN_CEK_VE_KARTLAR ,
                     sum(nvl(A.SEKAR,0)) as SEKAR    
                FROM ofsa_sb.prod_cust_profit@OLAX_LINK a
               WHERE     1 = 1
                 and a.as_of_date = To_Date('28-07-2026', 'dd-mm-yyyy')
                 AND a.sube_kodu NOT IN (1,
                                             188,
                                             172,
                                             219,
                                             33,
                                             187)
GROUP BY a.as_of_date,
                     a.create_date,
                     a.mus_no,
                     a.mus_adi,
                     LPAD (a.sube_kodu, 3, 0),
                     a.sube_adi,
                     a.bolge_adi,
                     TO_CHAR (A.BOLGE_KODU),
                     a.iskolu,
                     a.segment,
                     a.mt_sicil,
                     a.mt_adi,
                     a.urun_kodu,
                     a.urun,
                     a.para_birimi,
                     A.PRIVATE_BRANCH_FLAG) MUSTERI_KARLILIK