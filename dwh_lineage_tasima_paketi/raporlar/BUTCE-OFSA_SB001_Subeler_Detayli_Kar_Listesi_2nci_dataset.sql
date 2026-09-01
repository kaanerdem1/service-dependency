   SELECT * FROM ( SELECT AS_OF_DATE
               AS TARIH,
         TRIM (TO_CHAR (SUBE_KODU, '000'))
               AS SUBE_KODU,
           --sube_adi,
           RANK ()
               OVER (PARTITION BY as_of_Date
                     ORDER BY FAALIYET_KARI_LINEER DESC)
               AS FLYT_KARI_LNR_SIRA,
           RANK ()
               OVER (PARTITION BY as_of_Date
                     ORDER BY PERFORMANS_KARI_LINEER DESC)
               AS PERF_KARI_LNR_SIRA
      FROM (  SELECT a.as_of_Date,
                     a.sube_kodu,
                     --a.sube_adi,
                     SUM (a.FAALIYET_KARI_LINEER)      AS FAALIYET_KARI_LINEER,
                     SUM (a.PERFORMANS_KARI_LINEER)    AS PERFORMANS_KARI_LINEER
                FROM ofsa_sb.prod_org_profit@OLAX_LINK a,
                     olap.dm_organization@OLAX_LINK   org
               WHERE     1 = 1
                     and as_of_date=To_Date('29-07-2026', 'dd-mm-yyyy')

                     AND TO_NUMBER (a.sube_kodu) = TO_NUMBER (org.gl_org_code)
                     AND org.State != 0
                     AND a.sube_kodu NOT IN (33,
                                             172,
                                             187,
                                             188,
                                             902,
                                             903)
                     AND a.bolge_adi NOT IN ('GM', 'OPERASYON GMY')
                
            GROUP BY a.as_of_Date, a.sube_kodu                             
                                             
                                              )) B
