import type { TeacherRepositoryPort } from "../../ports/repositories/teacher.repository.port";
import type {
  PublicRegionSummary,
  PublicDistrictSummary,
  PublicTeacherListPage,
} from "../../dto/public-teacher-catalog.dto";

const PAGE_SIZE = 10;

/**
 * Public "рџ‘ЁвЂЌрџЏ« Ustozlar" catalog: Viloyat в†’ Tuman/Shahar в†’ Ustozlar ro'yxati.
 * No auth (public bot, unauthenticated users) вЂ” every query is scoped to
 * publishStatus="published" at the repository level (see TeacherRepository's
 * listPublished* methods), so pending/rejected/ready_for_publish teachers can
 * never surface here regardless of how this use case is called.
 */
export class GetPublicTeacherCatalogUseCase {
  constructor(private readonly teacherRepo: TeacherRepositoryPort) {}

  async listRegions(): Promise<PublicRegionSummary[]> {
    const regions = await this.teacherRepo.listPublishedRegionsWithCounts();
    return regions.map((region) => ({
      id: region.id,
      name: region.nameUzLatn,
      publishedTeacherCount: region.publishedCount,
    }));
  }

  async listDistricts(regionId: string): Promise<PublicDistrictSummary[]> {
    const districts = await this.teacherRepo.listPublishedDistrictsByRegion(regionId);
    return districts.map((district) => ({
      id: district.id,
      name: district.nameUzLatn,
      publishedTeacherCount: district.publishedCount,
    }));
  }

  async listTeachers(districtId: string, page: number): Promise<PublicTeacherListPage> {
    const safePage = Math.max(0, page);
    const offset = safePage * PAGE_SIZE;

    const { items, total } = await this.teacherRepo.listPublishedTeachersByDistrict(
      districtId,
      PAGE_SIZE,
      offset,
    );

    return {
      items,
      page: safePage,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    };
  }
}