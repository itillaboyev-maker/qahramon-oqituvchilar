import { normalizeName } from "../src/shared/utils/normalize-name";
import { TeacherIdentityResolver } from "../src/domain/services/teacher-identity-resolver.service";

const resolver = new TeacherIdentityResolver();

const existingCandidate = {
  id: "teacher-1",
  normalizedName: normalizeName("Hakimov Otabek"),
  districtId: "district-chilonzor",
  school: "42-maktab",
  subject: "Matematika",
  yearsOfExperience: 15,
};

console.log("=== Case 1: true variant, same district/school/subject (should auto-attach, >=88) ===");
console.log(
  resolver.scoreCandidate(
    {
      normalizedName: normalizeName("Ҳакимов Отабек"),
      districtId: "district-chilonzor",
      school: "42-maktab",
      subject: "Matematika",
      yearsOfExperience: 17,
    },
    existingCandidate,
  ),
);

console.log("\n=== Case 2: true variant name, but different district+school (should be lower, candidate-log range) ===");
console.log(
  resolver.scoreCandidate(
    {
      normalizedName: normalizeName("O. Hakimov"),
      districtId: "district-yunusobod",
      school: "15-maktab",
      subject: "Matematika",
      yearsOfExperience: 12,
    },
    existingCandidate,
  ),
);

console.log("\n=== Case 3: genuinely different person, different everything (should be low, <55) ===");
console.log(
  resolver.scoreCandidate(
    {
      normalizedName: normalizeName("Botir Yusupov"),
      districtId: "district-yunusobod",
      school: "15-maktab",
      subject: "Tarix",
      yearsOfExperience: 5,
    },
    existingCandidate,
  ),
);

console.log("\n=== Case 4: unknown attributes (nulls), same name only (neutral scoring check) ===");
console.log(
  resolver.scoreCandidate(
    {
      normalizedName: normalizeName("Otabek Hakimov"),
      districtId: null,
      school: null,
      subject: null,
      yearsOfExperience: null,
    },
    existingCandidate,
  ),
);
