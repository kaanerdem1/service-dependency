# Hop-1 test servisleri

| Hedef | Servis | Gerçek bağ | id |
|------:|--------|-----------:|----|
| 3 | `CCS_CRD_USAGE_GET_MIGRATION_INFO_BRANCH` | 3 | `sd-9` |
| 5 | `CONS_CALCULATE_PAYMENT_DETAIL_FOR_PTT` | 5 | `sd-214` |
| 7 | `CCS_CRD_CREDIT_COST_RATE_GET` | 7 | `sd-6` |
| 10 | `CONS_APPLICATION_GET_APPLICATION_INFO` | 10 | `sd-758` |
| 15 | `CONS_APPLICATION_ADK_UPDATE_APPLICATION` | 15 | `sd-1728` |
| 20 | `CONS_APPLICATION_GET_APPLICATION_MAIN_INFO` | 20 | `sd-5098` |
| 249 (hub) | `PROPOSAL_MAIN_GET` | 249 | `sd-37504` |

Konumsuz (~25.734): `service_definition` var, `java_method.service_definition_id` yok → jar join kurulamaz. Arama ile ad yazınca yine bulunur. Ağaçta `Konumsuz servisler` kökü de listeler.
