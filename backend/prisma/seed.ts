import 'dotenv/config';
import { PrismaClient, RoleCode } from '@prisma/client';
import { PERMISSIONS, ROLE_DEFINITIONS } from '../src/config/permissions';

const prisma = new PrismaClient();

export async function seedRbac(client: PrismaClient = prisma): Promise<void> {
  // 1. Ensure system roles exist (single batch query)
  await client.role.createMany({
    data: ROLE_DEFINITIONS.map((r) => ({
      code: r.code,
      name: r.name,
      description: r.description,
      isSystem: true,
    })),
    skipDuplicates: true,
  });

  // 2. Ensure all permissions exist (single batch query)
  await client.permission.createMany({
    data: PERMISSIONS.map((p) => ({
      key: p.key,
      module: p.module,
      description: p.description,
      isAssistantConfigurable: p.isAssistantConfigurable,
    })),
    skipDuplicates: true,
  });

  const [roles, permissions] = await Promise.all([
    client.role.findMany({ select: { id: true, code: true } }),
    client.permission.findMany({ select: { id: true, key: true } }),
  ]);

  const roleMap = new Map<RoleCode, string>(roles.map((r) => [r.code, r.id]));
  const permissionMap = new Map<string, string>(permissions.map((p) => [p.key, p.id]));

  const ownerRoleId = roleMap.get(RoleCode.FARM_OWNER)!;
  const assistantRoleId = roleMap.get(RoleCode.FARM_ASSISTANT)!;

  // 3. Map all permissions to FARM_OWNER and operational subset to FARM_ASSISTANT
  const ownerLinks = PERMISSIONS.map((p) => ({
    roleId: ownerRoleId,
    permissionId: permissionMap.get(p.key)!,
  }));

  const assistantLinks = PERMISSIONS.filter((p) => p.assistantDefault).map((p) => ({
    roleId: assistantRoleId,
    permissionId: permissionMap.get(p.key)!,
  }));

  await client.rolePermission.createMany({
    data: [...ownerLinks, ...assistantLinks],
    skipDuplicates: true,
  });
}

if (require.main === module) {
  seedRbac()
    .then(() => {
      console.log(`Seeded ${ROLE_DEFINITIONS.length} roles and ${PERMISSIONS.length} permissions.`);
    })
    .catch((err) => {
      console.error('Failed to seed RBAC:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
