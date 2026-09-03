import { query, tableName } from './db.js'
import { countUnlocatedServices } from './treeService.js'

export type CatalogJarSummary = {
  id: string
  name: string
  serviceCount: number
}

export type CatalogProjectSummary = {
  id: string
  name: string
  description: string | null
  responsibleItTeam: string | null
  responsibleBusinessUnit: string | null
}

export type CatalogGroupDetail = {
  id: string
  name: string
  description: string | null
  jarCount: number
  projectCount: number
  serviceCount: number
  jars: CatalogJarSummary[]
  projects: CatalogProjectSummary[]
}

export type CatalogServiceSample = {
  id: string
  name: string
}

export type CatalogArtifactDetail = {
  id: string
  name: string
  serviceCount: number
  classCount: number
  project: CatalogProjectSummary
  group: {
    id: string
    name: string
    description: string | null
  }
  sampleServices: CatalogServiceSample[]
}

export async function getGroupDetail(nodeId: string): Promise<CatalogGroupDetail | undefined> {
  if (nodeId === 'unlocated') {
    const total = await countUnlocatedServices()
    return {
      id: 'unlocated',
      name: 'Konumsuz servisler',
      description:
        'Entry metod / jar bağlantısı olmayan servis tanımları. Arama ile bulunabilir; IT/BU ve jar yolu okunamaz.',
      jarCount: 0,
      projectCount: 0,
      serviceCount: total,
      jars: [],
      projects: [],
    }
  }

  const m = /^pg-(\d+)$/.exec(nodeId)
  if (!m) return undefined
  const groupId = Number(m[1])

  const { rows: head } = await query<{
    name: string
    description: string | null
    jar_count: string
    project_count: string
    service_count: string
  }>(
    `SELECT pg.project_group_name AS name,
            pg.description,
            COUNT(DISTINCT a.id)::text AS jar_count,
            COUNT(DISTINCT p.id)::text AS project_count,
            COUNT(DISTINCT sd.id)::text AS service_count
     FROM ${tableName('project_group')} pg
     LEFT JOIN ${tableName('project')} p ON p.project_group_id = pg.id
     LEFT JOIN ${tableName('artifact')} a ON a.project_id = p.id
     LEFT JOIN ${tableName('java_class')} jc ON jc.artifact_id = a.id
     LEFT JOIN ${tableName('java_method')} jm
       ON jm.class_id = jc.id AND jm.service_definition_id IS NOT NULL
     LEFT JOIN ${tableName('service_definition')} sd
       ON sd.id = jm.service_definition_id AND sd.status = 1
     WHERE pg.id = $1
     GROUP BY pg.id, pg.project_group_name, pg.description`,
    [groupId],
  )
  const row = head[0]
  if (!row) return undefined

  const { rows: jars } = await query<{ id: string; name: string; svc_count: string }>(
    `SELECT a.id::text AS id,
            a.name,
            COUNT(DISTINCT sd.id)::text AS svc_count
     FROM ${tableName('artifact')} a
     JOIN ${tableName('project')} p ON p.id = a.project_id
     LEFT JOIN ${tableName('java_class')} jc ON jc.artifact_id = a.id
     LEFT JOIN ${tableName('java_method')} jm
       ON jm.class_id = jc.id AND jm.service_definition_id IS NOT NULL
     LEFT JOIN ${tableName('service_definition')} sd
       ON sd.id = jm.service_definition_id AND sd.status = 1
     WHERE p.project_group_id = $1
     GROUP BY a.id, a.name
     ORDER BY a.name`,
    [groupId],
  )

  const { rows: projects } = await query<{
    id: string
    name: string
    description: string | null
    it_team: string | null
    bu: string | null
  }>(
    `SELECT p.id::text AS id,
            p.project_name AS name,
            p.project_description AS description,
            p.responsible_it_team AS it_team,
            p.responsible_business_unit AS bu
     FROM ${tableName('project')} p
     WHERE p.project_group_id = $1
     ORDER BY p.project_name`,
    [groupId],
  )

  return {
    id: nodeId,
    name: row.name,
    description: row.description?.trim() || null,
    jarCount: Number(row.jar_count),
    projectCount: Number(row.project_count),
    serviceCount: Number(row.service_count),
    jars: jars.map((j) => ({
      id: `art-${j.id}`,
      name: j.name,
      serviceCount: Number(j.svc_count),
    })),
    projects: projects.map((p) => ({
      id: `proj-${p.id}`,
      name: p.name,
      description: p.description?.trim() || null,
      responsibleItTeam: p.it_team?.trim() || null,
      responsibleBusinessUnit: p.bu?.trim() || null,
    })),
  }
}

export async function getArtifactDetail(nodeId: string): Promise<CatalogArtifactDetail | undefined> {
  const m = /^art-(\d+)$/.exec(nodeId)
  if (!m) return undefined
  const artifactId = Number(m[1])

  const { rows: head } = await query<{
    name: string
    project_id: string
    project_name: string
    project_description: string | null
    it_team: string | null
    bu: string | null
    group_id: string
    group_name: string
    group_description: string | null
    service_count: string
    class_count: string
  }>(
    `SELECT a.name,
            p.id::text AS project_id,
            p.project_name,
            p.project_description,
            p.responsible_it_team AS it_team,
            p.responsible_business_unit AS bu,
            pg.id::text AS group_id,
            pg.project_group_name AS group_name,
            pg.description AS group_description,
            COUNT(DISTINCT sd.id)::text AS service_count,
            COUNT(DISTINCT jc.id)::text AS class_count
     FROM ${tableName('artifact')} a
     JOIN ${tableName('project')} p ON p.id = a.project_id
     JOIN ${tableName('project_group')} pg ON pg.id = p.project_group_id
     LEFT JOIN ${tableName('java_class')} jc ON jc.artifact_id = a.id
     LEFT JOIN ${tableName('java_method')} jm
       ON jm.class_id = jc.id AND jm.service_definition_id IS NOT NULL
     LEFT JOIN ${tableName('service_definition')} sd
       ON sd.id = jm.service_definition_id AND sd.status = 1
     WHERE a.id = $1
     GROUP BY a.id, a.name, p.id, p.project_name, p.project_description,
              p.responsible_it_team, p.responsible_business_unit,
              pg.id, pg.project_group_name, pg.description`,
    [artifactId],
  )
  const row = head[0]
  if (!row) return undefined

  const { rows: samples } = await query<{ id: string; name: string }>(
    `SELECT sd.id::text AS id, sd.service_name AS name
     FROM ${tableName('service_definition')} sd
     JOIN ${tableName('java_method')} jm ON jm.service_definition_id = sd.id
     JOIN ${tableName('java_class')} jc ON jc.id = jm.class_id
     WHERE jc.artifact_id = $1 AND sd.status = 1
     ORDER BY sd.service_name
     LIMIT 24`,
    [artifactId],
  )

  return {
    id: nodeId,
    name: row.name,
    serviceCount: Number(row.service_count),
    classCount: Number(row.class_count),
    project: {
      id: `proj-${row.project_id}`,
      name: row.project_name,
      description: row.project_description?.trim() || null,
      responsibleItTeam: row.it_team?.trim() || null,
      responsibleBusinessUnit: row.bu?.trim() || null,
    },
    group: {
      id: `pg-${row.group_id}`,
      name: row.group_name,
      description: row.group_description?.trim() || null,
    },
    sampleServices: samples.map((s) => ({
      id: `sd-${s.id}`,
      name: s.name,
    })),
  }
}
