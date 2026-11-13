import openpyxl, sys, warnings, json, re
warnings.filterwarnings("ignore")
wb = openpyxl.load_workbook(sys.argv[1], keep_vba=True)
inp, ce, pv, bv, fv, wd = (wb[n] for n in ["Input","Calc Engine","PV_DSK","BV_DSK","FV_DSK","WD_DG"])
def t(ws,a):
    v=ws[a].value
    return v.strip() if isinstance(v,str) else v
def col(ws,c,r1,r2): return [t(ws,f"{c}{r}") for r in range(r1,r2+1) if t(ws,f"{c}{r}") not in (None,"")]
def row(ws,r,c1,c2):
    out=[]
    for c in range(c1,c2+1):
        v=ws.cell(r,c).value
        if isinstance(v,str) and not v.startswith("=") and v.strip(): out.append(v.strip())
    return out
def lbl(ws,r,c1=2,c2=7):
    parts=[ws.cell(r,c).value for c in range(c1,c2+1)]
    s=" ".join(p.strip() for p in parts if isinstance(p,str) and not p.startswith("=") and len(p.strip())>1)
    s=re.sub(r"^[a-f]\)\s*","",s); s=re.sub(r"\s+"," ",s).strip()
    return s
def slug(s):
    w=re.sub(r"[^a-zA-Z0-9 ]"," ",s).split()
    w=[x for x in w if x.lower() not in ("the","of","is","it","a","to","if","any","what","with","and","or","be","at","by","there","will","like")][:4]
    return (w[0].lower()+"".join(x.capitalize() for x in w[1:])) if w else "field"
fix = lambda s: s.replace("residntial","residential") if isinstance(s,str) else s
cat={}
cat["lists"]={
 "loanCategory": col(inp,"I",4,10),
 "loanType": col(inp,"J",4,10),
 "salutation": col(inp,"K",4,10),
 "relation": col(inp,"L",4,10),
 "siteShape": col(inp,"M",4,10),
 "propertyNumberType": col(inp,"N",4,10),
 "localBodyType": col(inp,"O",4,11),
 "propertyType": col(inp,"P",4,10),
 "documentType": row(inp,35,12,18),
 "documentCopy": ["Copy","Original"],
 "direction": ["North","South","East","West"],
}
# purposes from Calc Engine
groups=[];cur=None
for r in range(1,ce.max_row+1):
    a,b=ce.cell(r,1).value, ce.cell(r,2).value
    if isinstance(a,str) and a!="S.No" and b is None: cur={"group":re.sub(r"^[^\w]+","",a).strip(),"items":[]}; groups.append(cur)
    elif isinstance(a,(int,float)) and b:
        if cur is None: cur={"group":"Banking / Financial Institutions","items":[]}; groups.insert(0,cur)
        cur["items"].append({"label":b.strip(),"description":(ce.cell(r,3).value or "").strip()})
cat["valuationPurposes"]=groups
def choices(ws,rows,c1=13,c2=17):
    out=[]; seen=set()
    for r in rows:
        L=lbl(ws,r)
        if not L: continue
        k=slug(L)
        while k in seen: k+="2"
        seen.add(k)
        out.append({"key":k,"label":fix(L),"options":[fix(o) for o in row(ws,r,c1,c2)]})
    return out
cat["siteCharacteristics"]=choices(pv,[r for r in range(90,112) if r!=103])
cat["siteAdvantageOptions"]=row(pv,112,13,17)
cat["buildingCharacteristics"]=choices(bv,range(178,184))
cat["buildingApproval"]=choices(bv,range(195,200))
cat["buildingSpecs"]=choices(bv,range(206,212),14,18)
def tiers(r1,r2):
    out=[]; seen=set()
    for r in range(r1,r2+1):
        L=lbl(bv,r)
        vals=[bv.cell(r,c).value for c in range(13,17)]
        if not L or not any(isinstance(v,(int,float)) for v in vals): continue
        k=slug(L)
        while k in seen: k+="2"
        seen.add(k)
        out.append({"key":k,"label":L,"rates":vals,"ranges":row(bv,r,18,21)})
    return out
cat["amenities"]=tiers(242,261)
cat["waterServices"]=tiers(267,276)
cat["electrical"]=choices(bv,range(285,291))
cat["flatChoices"]=choices(fv,[139,140,141,143,144,145,146,147,148,149,155,156,157,158,159,166,175])
cat["constructionStages"]=[{"key":slug(lbl(wd,r,2,7)),"label":lbl(wd,r,2,7),"weight":wd.cell(r,8).value} for r in range(20,33)]

RENAME = {
 "developmentSurroundingAreas":"surroundingDevelopment","possibilityFrequentFloodingSubmerging":"flooding",
 "accessibilityCivicAmenitiesSchool":"civicAmenities","levelLandTopographicalConditions":"landLevel","shapeLand":"landShape",
 "typeUseWhichCan":"permittedUse","tenureLand":"landTenure","plotInTownPlanning":"approvedLayout",
 "problemGetDrawingApproval":"drawingApprovalIssue","cornerPlotIntermittentPlot":"plotPosition","typeRoadAvailablePresent":"roadType",
 "widthRoadBelow20":"roadWidth","landLockedLand":"landLocked","undergroundSewerageSystem":"sewerage","powerSupplyAvailableSite":"powerSupply",
 "typeBuilding":"buildingType","typeConstruction":"constructionType","qualityConstruction":"constructionQuality","appearanceBuilding":"appearance",
 "maintenanceConditionBuildingExterior":"maintenanceExterior","interior":"maintenanceInterior",
 "dateIssueValidityLayout":"layoutApprovalDate","bApprovedMapPlan":"approvalAuthority","cWhetherGenuinenessAuthentic":"approvalVerified",
 "dOtherCommentsOur":"approvalComments","eDiscussOnBuilding":"approvalDeviations","joineryDoorsWindowsPlease":"joinery",
 "sitOutVerandahSteel":"sitOut","extraSteelCollapsibleGates":"collapsibleGates","wardrobesShowCasesWooden":"wardrobes",
 "extraSinksBathTub":"extraSinks","architecturalElevationWorks":"elevationWorks","falseCeilingWorks":"falseCeiling",
 "ornamentalFrontPoojaDoor":"poojaDoor","separateWaterTankSump":"waterTankSump","treesGardening":"gardening",
 "separateLumberRoom":"lumberRoom","separateToiletRoom":"toiletRoom","underGroundLevelSump":"sump","overHeadWaterTank":"overheadTank",
 "drainageArrangements":"drainage","classFittingsSuperiorOrdinary":"fittingsClass","numberLightPoints":"lightPoints","typeWiring":"wiring",
 "otherItem":"otherProvisions","carParkingOpenCovered":"carParking","compoundWallExisting":"compoundWall","pavementLaidAroundBuilding":"pavement",
 "howMaintenanceFlat":"flatMaintenance","ownerOccupiedLetOut":"occupancy","maintenanceBuilding":"buildingMaintenance","otherFacility":"otherFacility",
 "foundationsFootingsPlinthLevel":"foundation","superstructureUpLintel":"lintel","superstructureUpRoofSlab":"roofSlab","roofingWaterproofing":"roofing",
 "plasteringInternalExternal":"plastering","internalFlooringWallTiles":"flooringTiles","doorsWindowsFixing":"doorsWindows",
 "electricalPlumbingConcealed":"electricalPlumbing","paintingInternalExternal":"painting","sanitaryFixturesGraniteShelves":"sanitary",
 "compoundWallGatePaving":"compoundWall","electricalFixturesFansLights":"electricalFixtures","miscellaneousFinalTouches":"finishing",
}
for sec in ["siteCharacteristics","buildingCharacteristics","buildingApproval","buildingSpecs","electrical","flatChoices","amenities","waterServices","constructionStages"]:
    for it in cat[sec]: it["key"]=RENAME.get(it["key"],it["key"])
# 'Advantages of the site' has no option list in the sheet: handled as free text in the form schema
cat["siteCharacteristics"]=[c for c in cat["siteCharacteristics"] if c["key"]!="advantagesSite"]
# Workbook typo: Sit-out Standard tier is 150000 while its range says 15,000-25,000
for a in cat["amenities"]:
    if a["key"]=="sitOut": a["rates"][1]=15000
# Marble/ceramic flooring row has only rate ranges (per sq.ft) and no numeric tier row - add lower bounds
cat["amenities"].insert(9,{"key":"marbleFlooring","label":"Marble / ceramic tiles flooring","rates":[60,90,130,180],"ranges":["60 – 90 /sq.ft","90 – 130 /sq.ft","130 – 180 /sq.ft","180 – 300 /sq.ft"]})
# Rows whose ranges are per unit need a quantity (the workbook adds the unit rate as if it were a lump sum)
for a in cat["amenities"]+cat["waterServices"]:
    r=" ".join(a["ranges"])
    a["unit"]="sq.ft" if "/sq.ft" in r else ("rft" if "/rft" in r else None)
cat["amenityTiers"]=["None","Basic","Standard","Deluxe","Premium"]

js="// AUTO-GENERATED from 'CB Format 2026.xlsm' by scripts/gen_catalog.py, then reviewed.\n// Option texts are kept verbatim from the workbook so generated reports read the same.\nexport const catalog = "+json.dumps(cat,ensure_ascii=False,indent=2)+";\n"
open(sys.argv[2],"w",encoding="utf-8").write(js)
print({k:(len(v) if isinstance(v,list) else {kk:len(vv) for kk,vv in v.items()}) for k,v in cat.items()})
for sec in ["siteCharacteristics","buildingCharacteristics","buildingApproval","buildingSpecs","electrical","flatChoices"]:
    print(sec, [c["key"] for c in cat[sec]])
print("amen", [(a["key"],a["rates"]) for a in cat["amenities"]])
print("water", [a["key"] for a in cat["waterServices"]]); print("stages",[s["key"] for s in cat["constructionStages"]])
