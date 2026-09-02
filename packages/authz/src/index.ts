export {
  PERMISSIONS,
  SENSITIVE_PERMISSIONS,
  OWN_VARIANTS,
  SYSTEM_ROLES,
  OUT_OF_MATRIX_ROLES,
  isPermission,
  type Permission,
  type SystemRole,
  type RoleKey,
  type ScopeKind,
  type RowFilter,
} from "./catalogue.js";
export { ROWS, type RowDef } from "./rows.js";
export { parseCell, type CellGrant } from "./cell.js";
export { parseMatrixMarkdown, type Matrix } from "./matrix.js";
export {
  buildRoles,
  systemRole,
  SYSTEM_ROLE_TABLE,
  type RoleDefinition,
  type RoleTable,
} from "./roles.js";
export {
  evaluate,
  covers,
  type Decision,
  type EvaluateInput,
  type Grant,
  type ScopeGraph,
  type ScopeRef,
} from "./evaluate.js";
