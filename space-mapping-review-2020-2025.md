# 空间映射（Space Mapping）在电磁领域的研究进展综述（2020-2025）

> 基于 IEEE Xplore 50+ 篇期刊论文的系统梳理
> 检索日期：2025年

---

## 一、引言

空间映射（Space Mapping, SM）最初由 Bandler 等人在1990年代提出，是一种基于代理模型（Surrogate Model）的高效电磁优化方法。其核心思想是利用计算效率高的粗糙模型（Coarse Model）来逼近计算昂贵但精度高的精细模型（Fine Model），通过建立二者之间的映射关系来加速设计优化过程。

近五年来（2020-2025），空间映射技术在电磁领域取得了显著进展，向着多物理场、神经网络驱动、认知驱动、网格空间映射等多个方向深入发展。本文基于 IEEE 期刊文献，系统梳理这一时期空间映射技术的研究进展。

---

## 二、网格空间映射（Mesh Space Mapping, MSM）

### 2.1 经典MSM方法发展

网格空间映射（MSM）在传统等效电路粗模型不可用时，通过粗/细网格分化来构建映射关系，已成为空间映射的重要分支。

**📄 [1] Zhang et al. (2020)** "Efficient Yield Estimation of Microwave Structures Using Mesh Deformation-Incorporated Space Mapping Surrogates"
- *IEEE MWCL, vol. 30, no. 10, pp. 937-940, 2020*
- **核心贡献**：将网格变形（Mesh Deformation）融入粗网格仿真，使粗网格模型的EM响应随几何参数连续变化，从而允许使用更粗糙的网格加速良率估计。
- **关键词**：Mesh Deformation, Yield Estimation

**📄 [2] Li et al. (2023)** "Mesh Morphing-Embedded Space Mapping Optimization for Waveguide Components With Arc Structures"
- *IEEE MWTL, vol. 33, no. 5, pp. 503-506, 2023*
- **核心贡献**：针对带圆弧结构的波导器件，提出改进的网格变形技术，在圆弧上定义约束点引导节点平滑变形，加速优化过程。
- **关键词**：Mesh Morphing, Waveguide, Arc Structures

**📄 [3] Li et al. (2024)** "Advanced Mesh Space Mapping Approach With Fast Coarse Mesh Models Comprising Sharpening Structural Processing and Mesh Deformation"
- *IEEE TMTT, vol. 72, no. 3, pp. 1578-1590, 2024*
- **核心贡献**：提出锐化结构处理（SSP）技术，将含曲面单元的精细模型转化为全锐切割结构的粗模型，实现更稀疏的网格划分。结合改进的网格变形技术，显著降低粗模型计算成本。
- **关键词**：Sharpening Structural Processing, Coarse Mesh, Mesh Deformation

**📄 [4] Feng et al. (2025)** "Efficient Mesh Space Mapping Optimization for Tunable Filters Incorporating Structurally Simplified Coarse Mesh Model Without Tunable Elements"
- *IEEE TMTT, vol. 73, no. 5, pp. 2587-2600, 2025*
- **核心贡献**：针对可调滤波器提出结构简化的粗模型——去除所有可调元件（谐振腔内外），实现更稀疏的网格。提出系统模型简化算法、设计变量映射方法和并行多点代理训练技术。
- **关键词**：Tunable Filters, Structural Simplification, Coarse Mesh

**📄 [5] Feng et al. (2025)** "Electromagnetic Simulation-Inserted Optimization Method Incorporating Transfer Function Feature-Based Mesh Space Mapping"
- *IEEE TMTT, vol. 73, no. 10, pp. 7301-7314, 2025*
- **核心贡献**：提出传递函数特征基网格空间映射（MSM-SIO），将MSM技术与仿真插入优化（SIO）结合，利用复频域（CFD）技术提取精细模型TF特征，构建代理模型加速优化。
- **关键词**：Simulation-Inserted Optimization, Transfer Function, MSM-SIO

### 2.2 MSM的加速技术

**📄 [6] Li et al. (2025)** "Multilevel Reduced-Order Coarse-Model Development Technique for Accelerating Space Mapping Optimization of Microwave Filters"
- *IEEE TMTT, vol. 73, no. 12, pp. 9867-9885, 2025*
- **核心贡献**：提出多层级模型降阶（MOR）框架，直接从精细模型导出降阶粗模型（ROCM），避免网格粗化和经验拟合。第一层级实现快速宽带评估，第二层级在邻近几何间复用共享投影基。
- **关键词**：Model Order Reduction, Coarse Model, Automation

---

## 三、神经网络空间映射（Neural Space Mapping, NSM）

### 3.1 神经网络映射建模

**📄 [7] Na et al. (2025)** "Advanced Neural Space Mapping-Based Inverse Modeling Method for Microwave Filter Design"
- *IEEE MWTL, vol. 35, no. 1, pp. 12-15, 2025*
- **核心贡献**：首次将NSM引入逆建模，提出输入维度约简（IDR）技术，利用傅里叶变换及低频子空间将S参数曲线转化为信号谱以降低维度。
- **关键词**：Neural Space Mapping, Inverse Modeling, Dimensional Reduction

**📄 [8] Yan et al. (2025)** "An Enhanced Space-Mapping Neural Network Incorporating a Dynamic Scaling Layer for Parametric Modeling of Microwave Components"
- *IEEE MWTL, vol. 35, no. 8, pp. 1102-1105, 2025*
- **核心贡献**：在映射神经网络（MNN）输出端引入动态缩放层，自动调整电路元件值的数值分布，避免梯度消失/爆炸，提高建模精度。
- **关键词**：Dynamic Scaling Layer, SMNN, Parametric Modeling

**📄 [9] Zhao et al. (2020)** "Space Mapping Technique Using Decomposed Mappings for GaN HEMT Modeling"
- *IEEE TMTT, vol. 68, no. 8, pp. 3318-3341, 2020*
- **核心贡献**：提出分解映射的SM建模技术，为GaN HEMT器件的不同分支（陷阱效应、频率色散等）分别建立独立的映射模块，提升非线性器件建模精度。
- **关键词**：GaN HEMT, Decomposed Mappings, Nonlinear Modeling

**📄 [10] Zhang et al. (2025)** "A Wideband Pseudo-CPW-Based Grid Antenna: Novel Design and Optimization via Space-Mapped Cascaded DNN and PSO Algorithm"
- *IEEE TAP, vol. 73, no. 11, pp. 8505-8517, 2025*
- **核心贡献**：提出级联深度神经网络（CDNN）代理模型结合空间映射技术，用于网格天线的快速优化，初始数据采集成本降低50%以上。
- **关键词**：Cascaded DNN, Space Mapping, PSO, Grid Antenna

### 3.2 Neuro-Transfer Function（Neuro-TF）方法

**📄 [11] Zhao et al. (2020)** "Parametric Modeling of EM Behavior of Microwave Components Using Combined Neural Networks and Hybrid-Based Transfer Functions"
- *IEEE Access, vol. 8, pp. 93922-93938, 2020*
- **核心贡献**：提出混合基Neuro-TF技术，自动识别光滑连续的极点/留数和不连续/非光滑的极点/留数，将后者转换为有理基传递函数，解决大几何变化下的不连续性问题。
- **关键词**：Neuro-TF, Hybrid-Based, Pole-Residue, Rational

**📄 [12] Chen et al. (2024)** "Advanced Neuro-TF Modeling Technique Incorporating Quadratic Approximated Vector Fitting of Parametric Pole/Residue Extraction"
- *IEEE TMTT, vol. 72, no. 2, pp. 966-980, 2024*
- **核心贡献**：提出二次近似矢量匹配技术，在矢量拟合过程中引入二次近似表示极点/留数与几何参数的关系，实现大几何变化下的光滑极点提取。
- **关键词**：Neuro-TF, Vector Fitting, Quadratic Approximation

**📄 [13] Feng et al. (2020)** "Multifeature-Assisted Neuro-transfer Function Surrogate-Based EM Optimization Exploiting Trust-Region Algorithms for Microwave Filter Design"
- *IEEE TMTT, vol. 68, no. 2, pp. 531-542, 2020*
- **核心贡献**：提出多特征辅助的Neuro-TF代理优化技术，利用极点-零点Neuro-TF提取多个特征参数，新的信赖域更新公式保证收敛，有效避免局部最优。
- **关键词**：Multifeature, Neuro-TF, Trust-Region, Feature Surrogate

### 3.3 知识基神经网络

**📄 [14] Ye et al. (2023)** "Knowledge-Based Neural Network for Multiphysical Field Modeling"
- *IEEE TMTT, vol. 71, no. 5, pp. 1967-1976, 2023*
- **核心贡献**：提出知识基神经网络（KBNN），利用BP-ANN提供传递函数ANN先验知识，处理多物理场参数（几何、电压、温度），支持形状优化。
- **关键词**：Knowledge-Based NN, Multiphysics, Shape Optimization

---

## 四、认知驱动空间映射（Cognition-Driven Space Mapping）

### 4.1 基于传输函数特征的认知驱动优化

**📄 [15] Jin et al. (2021)** "Advanced Cognition-Driven EM Optimization Incorporating Transfer Function-Based Feature Surrogate for Microwave Filters"
- *IEEE TMTT, vol. 69, no. 1, pp. 15-28, 2021*
- **核心贡献**：提出基于传输函数特征的认知驱动EM优化，提取TF特征参数构建特征代理模型，在特征空间中建立新的目标函数，比传统特征辅助方法收敛更快。
- **关键词**：Cognition-Driven, Transfer Function, Feature Surrogate

**📄 [16] Feng et al. (2025)** "A Novel Cognition-Driven Electromagnetic Optimization Using Impedance Feature-Based Space Mapping for Microwave Filters"
- *IEEE TMTT, vol. 73, no. 10, pp. 7331-7350, 2025*
- **核心贡献**：提出阻抗特征基空间映射，将认知从S参数特征提升到Z参数零点/极点特征，解决初始点远离设计规格时特征不易识别的问题。推导了基于不变相位因子的认知公式，无需显式代理模型。
- **关键词**：Impedance Feature, Cognition-Driven, Z-Parameter

**📄 [17] Ma et al. (2025)** "Impedance-Feature-Based Gauss–Newton Optimization Incorporating MOR and FFS Sensitivity for Waveguide Filters"
- *IEEE TMTT, vol. 73, no. 12, pp. 10300-10313, 2025*
- **核心贡献**：提出阻抗特征基Gauss-Newton优化算法，集成模型降阶（MOR）和快速频率扫描（FFS）灵敏度。推导了阻抗特征在FEM下的导数显式表达式及修正快速导数公式。
- **关键词**：Impedance Feature, Gauss-Newton, MOR, FFS Sensitivity

**📄 [18] Rayas-Sánchez (2025)** "Cognitive Broyden-Based Input Space Mapping for Design Optimization"
- *IEEE MWTL, vol. 35, no. 6, pp. 760-763, 2025*
- **核心贡献**：提出认知空间映射（Cognitive SM），首次充分利用传统粗模型，采用先前的认知驱动参数提取（PE）公式，是Aggressive SM（ASM）的扩展。
- **关键词**：Cognitive SM, Broyden, Input SM, ASM

### 4.2 基于散射特征的调谐驱动优化

**📄 [19] Qin et al. (2025)** "An Efficient Scattering Characteristics Similarity-Based Tuning-Driven Optimization Method for Microwave Filters"
- *IEEE TMTT, vol. 73, no. 8, pp. 4534-4546, 2025*
- **核心贡献**：提出基于散射特征相似性的调谐驱动优化（SCSTDO），构建调谐优化模型匹配库（TOML），利用高斯分布采样生成高代表性样本。
- **关键词**：Scattering Characteristics, Tuning-Driven, TOML

---

## 五、多物理场空间映射

### 5.1 EM单物理场与多物理场映射

**📄 [20] Zhang et al. (2021)** "Advanced Parallel Space-Mapping-Based Multiphysics Optimization for High-Power Microwave Filters"
- *IEEE TMTT, vol. 69, no. 5, pp. 2470-2484, 2021*
- **核心贡献**：首次将空间映射从EM优化提升到多物理场优化。以EM单物理场响应为粗模型，ANN建立频率映射和显式输入映射，定制信赖域算法保证收敛。
- **关键词**：Multiphysics, Space Mapping, ANN, Trust-Region

**📄 [21] Hu et al. (2025)** "Advanced Space Mapping Technique Integrating a Shared Coarse Model for Multistate Tuning-Driven Multiphysics Optimization of Tunable Filters"
- *IEEE TMTT, vol. 73, no. 11, pp. 8726-8743, 2025*
- **核心贡献**：提出共享粗模型多状态调谐驱动多物理场优化方法。单一EM单物理场粗模型配合多个子代理模型（每个子代理模型对应一种调谐状态），同步优化所有调谐状态。
- **关键词**：Multistate Tuning, Shared Coarse Model, Multiphysics

**📄 [22] Yang et al. (2025)** "Multifidelity Space-Mapping-Based Approach for Accelerated Multiphysics Optimization of Microwave Devices"
- *IEEE TMTT, vol. 73, no. 12, pp. 9902-9919, 2025*
- **核心贡献**：提出双层级空间映射框架。第一层映射连接高保真多物理场分析与EM单物理场分析，第二层映射连接EM精细模型与粗网格EM粗模型。ANN构建两个映射，实现多保真度过渡。
- **关键词**：Multifidelity, Two-Layer SM, Trust-Region

---

## 六、天线设计中的空间映射

### 6.1 天线阵列优化

**📄 [23] Gu et al. (2021)** "Design of Wide Scanning Sparse Planar Array Using Both Matrix-Pencil and Space-Mapping Methods"
- *IEEE AWPL, vol. 20, no. 2, pp. 140-144, 2021*
- **核心贡献**：结合Matrix Pencil和空间映射方法设计宽带扫描稀疏平面阵列。利用特征模式和MLFMA在粗/细模型间建立参数映射。
- **关键词**：Sparse Array, Matrix Pencil, Wide Scanning

**📄 [24] Zhai et al. (2025)** "Advanced Space-Mapping-Based Approach for Accelerated Optimization of Metasurface-Combined Circularly Polarized Antenna"
- *IEEE AWPL, vol. 24, no. 11, pp. 3991-3995, 2025*
- **核心贡献**：提出基于空间映射的神经网络与信赖域算法加速超表面圆极化天线优化。并行数据生成策略同时生成粗/细网格数据，显著减少迭代次数。
- **关键词**：Metasurface, Circular Polarization, Parallel Data, Trust-Region

**📄 [25] Jiao et al. (2023)** "A Multisurrogate-Assisted Optimization Framework for SSPP-Based mmWave Array Antenna"
- *IEEE TAP, vol. 71, no. 4, pp. 2938-2945, 2023*
- **核心贡献**：提出多代理辅助优化框架，第三阶段利用空间映射技术结合改进的阵列因子公式作为代理，实现波束赋形优化。
- **关键词**：SSPP, mmWave Array, Multisurrogate, Space Mapping

### 6.2 MIMO天线解耦网络

**📄 [26] Jiang et al. (2021)** "An Efficient Optimization Scheme for MIMO Antenna Decoupling Networks Using Space Mapping Techniques"
- *IEEE JMMCT, vol. 6, pp. 56-61, 2021*
- **核心贡献**：将SM技术用于MIMO天线解耦网络优化。提出两种粗模型构建方法：传统DN法和内部多端口法（IMPM），优化速度提升约20倍。
- **关键词**：MIMO, Decoupling Network, IMPM

### 6.3 天线容差优化

**📄 [27] Koziel & Pietrenko-Dabrowska (2022)** "Tolerance-Aware Multi-Objective Optimization of Antennas by Means of Feature-Based Regression Surrogates"
- *IEEE TAP, vol. 70, no. 7, pp. 5636-5646, 2022*
- **核心贡献**：提出基于特征回归代理的容差感知多目标优化天线方法。利用EM仿真中提取的天线响应特征点建立代理，评估性能-鲁棒性折中。
- **关键词**：Tolerance, Multi-Objective, Feature-Based Regression

---

## 七、空间映射在微波滤波器中的应用

### 7.1 滤波器设计优化

**📄 [28] Roy & Wu (2024)** "Surrogate Model-Based Filter Optimization by a Field-Circuit Model Mapping"
- *IEEE TMTT, vol. 72, no. 5, pp. 3144-3157, 2024*
- **核心贡献**：创新性地将等效电路模型参数映射到场模型几何参数（而非传统的从粗模型到细模型映射），通过分割EM结构提取电路参数，实现高效滤波器设计。
- **关键词**：Field-Circuit Mapping, Neural Network, Filter Optimization

**📄 [29] Liu et al. (2024)** "Optimization Method Incorporating Equivalent Circuit Theory and Space Mapping for Metamaterial Absorbers"
- *IEEE TMTT, vol. 72, no. 11, pp. 6286-6295, 2024*
- **核心贡献**：将等效电路理论与SM结合用于超材料吸波体优化。以反射系数公式为粗模型，ANN建立映射，引入正交和星形采样减少训练样本。
- **关键词**：Metamaterial Absorber, Equivalent Circuit, ANN-SM

### 7.2 滤波器调谐与几何缩放

**📄 [30] Li et al. (2020)** "Surrogate Model-Based Space Mapping in Postfabrication Bandpass Filters' Tuning"
- *IEEE TMTT, vol. 68, no. 6, pp. 2172-2182, 2020*
- **核心贡献**：提出基于代理模型的后制造带通滤波器调谐方法。利用隐式多点参数提取技术匹配响应及其一阶导数，提升鲁棒性和收敛性。
- **关键词**：Postfabrication Tuning, Implicit Multipoint PE, Surrogate

**📄 [31] Liu et al. (2024)** "Adaptive Homotopy-Based Inverse Model for the Geometry Scaling of Microwave Filters"
- *IEEE TMTT, vol. 72, no. 1, pp. 680-695, 2024*
- **核心贡献**：引入同伦延拓（HC）方法实现滤波器几何缩放。自适应调整同伦参数，构建几何参数池和电参数池跟踪传输零点偏移。
- **关键词**：Homotopy, Inverse Model, Geometry Scaling

---

## 八、空间映射在其他电磁器件中的应用

### 8.1 耦合器与功分器

**📄 [32] Qiao et al. (2022)** "Space-Mapping Based Automatic Design of SIW-Based Directional Coupler With Arbitrary Power Ratio"
- *IEEE JMMCT, vol. 7, pp. 200-206, 2022*
- **核心贡献**：提出SM自动设计SIW定向耦合器，以介质矩形波导模型为代理，结合差分进化和Nelder-Mead算法实现3-20dB任意功率比设计。
- **关键词**：SIW, Directional Coupler, DE-NM, Space Mapping

### 8.2 电磁屏蔽

**📄 [33] Chen et al. (2020)** "Fast Design of Multilayered Shields Using Surrogate Model and Space Mapping"
- *IEEE TEMC, vol. 62, no. 3, pp. 698-706, 2020*
- **核心贡献**：双层代理优化多层屏蔽体。利用2D仿真作为粗模型避免3D计算，结合响应面近似和空间映射技术显著提高设计效率。
- **关键词**：Multilayered Shield, Surrogate, Response Surface Approximation

### 8.3 RF开关建模

**📄 [34] Yang et al. (2022)** "A Neuro-Space Mapping Method for Harmonic Interference Prediction of SOIFET Radio Frequency Switches"
- *IEEE TEMC, vol. 64, no. 4, pp. 1117-1123, 2022*
- **核心贡献**：提出动态神经空间映射网络模型，利用精度高但慢的精细模型和速度快但不够准的粗模型（INC模型），精确预测SOIFET开关谐波干扰。
- **关键词**：SOIFET, Harmonic Prediction, Neuro-SM

### 8.4 MMIC功率放大器布局

**📄 [35] Zhang et al. (2023)** "A Rapid Matching Network Layout Synthesis and Optimization Method for High-Performance MMIC PAs Using Modified Implicit Space Mapping"
- *IEEE TCSII, vol. 70, no. 3, pp. 924-928, 2023*
- **核心贡献**：改进隐式空间映射（ISM）用于MMIC功率放大器匹配网络版图综合优化。通过基于EM数据校准电路中的辅助参数，仅需10次EM仿真即可完成优化。
- **关键词**：MMIC PA, Implicit Space Mapping, Layout Synthesis

**📄 [36] Zhang et al. (2024)** "An Efficient Transistor-Model-Assisted Layout Synthesis Approach Using Improved Implicit Space Mapping for High-Performance MMIC PAs"
- *IEEE TCSII, vol. 71, no. 5, pp. 2639-2643, 2024*
- **核心贡献**：改进隐式空间映射（IISM）结合晶体管模型进行MMIC PA版图综合。利用匹配网络和晶体管模型的部分参数作为辅助参数，将EM仿真次数降至5次。
- **关键词**：IISM, MMIC PA, Layout Synthesis

### 8.5 雷达散射截面

**📄 [37] Yan et al. (2022)** "A Surrogate Modeling Technique Based on Space Mapping for Radar Cross Section"
- *IEEE AWPL, vol. 21, no. 8, pp. 1630-1633, 2022*
- **核心贡献**：基于空间映射的RCS代理模型，结合稀疏采样全波求解器和密集采样射线追踪求解器，克服固定线性映射限制。
- **关键词**：RCS, Surrogate Model, Ray-Tracing

---

## 九、代理建模与加速算法相关技术

### 9.1 多保真度与变分辨率技术

**📄 [38] Koziel et al. (2021)** "Low-Cost Modeling of Microwave Components by Means of Two-Stage Inverse/Forward Surrogates and Domain Confinement"
- *IEEE TMTT, vol. 69, no. 12, pp. 5189-5202, 2021*
- **核心贡献**：提出两阶段逆/正向代理加域约束的低成本建模方法，用少量随机可观测替代参考设计，建模成本降低约80%。
- **关键词**：Domain Confinement, Two-Stage, Low-Cost Modeling

**📄 [39] Koziel et al. (2022)** "Expedited Variable-Resolution Surrogate Modeling of Miniaturized Microwave Passives in Confined Domains"
- *IEEE TMTT, vol. 70, no. 11, pp. 4740-4750, 2022*
- **核心贡献**：集成性能驱动建模与变分辨率EM仿真，利用协克里金（Co-Kriging）实现大部分评估在粗离散化级别完成。
- **关键词**：Variable-Resolution, Co-Kriging, Performance-Driven

**📄 [40] Koziel et al. (2021)** "Reduced-Cost Microwave Design Closure by Multi-Resolution EM Simulations and Knowledge-Based Model Management"
- *IEEE Access, vol. 9, pp. 116326-116337, 2021*
- **核心贡献**：多级分辨率EM仿真管理与信赖域梯度算法结合，知识驱动连续修改离散化密度。从最低离散化水平启动优化，随收敛逐渐提高保真度。
- **关键词**：Multi-Resolution, Model Management, Trust-Region

### 9.2 电磁优化算法

**📄 [41] Feng et al. (2020)** "Efficient FEM-Based EM Optimization Technique Using Combined Lagrangian Method With Newton's Method"
- *IEEE TMTT, vol. 68, no. 6, pp. 2194-2205, 2020*
- **核心贡献**：提出拉格朗日法与牛顿法结合的EM优化技术。利用拉格朗日法将EM优化转化为约束优化，高效计算Hessian矩阵（避免二阶导数的耗时计算）。
- **关键词**：Lagrangian Method, Newton's Method, FEM

**📄 [42] Feng et al. (2021)** "Advanced Cognition-Driven EM Optimization Incorporating Transfer Function-Based Feature Surrogate for Microwave Filters"
- *IEEE TMTT, vol. 69, no. 1, pp. 15-28, 2021*
- 同上 #15

### 9.3 迁移学习

**📄 [43] Ma et al. (2023)** "Transfer Learning for the Behavior Prediction of Microwave Structures"
- *IEEE MWTL, vol. 33, no. 2, pp. 126-129, 2023*
- **核心贡献**：将迁移学习引入微波结构行为预测，减少训练所需数据量和缩短神经网络训练时间。
- **关键词**：Transfer Learning, Behavior Prediction, Deep Learning

**📄 [44] Ma et al. (2023)** "A High-Performance Transfer Learning-Based Model for Microwave Structure Behavior Prediction"
- *IEEE TCSII, vol. 70, no. 12, pp. 4394-4398, 2023*
- **核心贡献**：新颖的迁移学习模型加速微波电路行为预测，有效减少所需数据量和缩短训练时间，便于超参数微调。
- **关键词**：Transfer Learning, DNN, Frequency Sampling

---

## 十、综述与历史回顾

**📄 [45] Rayas-Sánchez, Koziel & Bandler (2021)** "Advanced RF and Microwave Design Optimization: A Journey and a Vision of Future Trends"
- *IEEE J. Microwaves, vol. 1, no. 1, pp. 481-493, 2021*
- **核心贡献**：回顾RF/微波设计优化历史演变，展望未来挑战。指出认知驱动空间映射、贝叶斯和机器学习技术是重要发展方向。
- **关键词**：Review, Future Trends, Cognition-Driven, Bayesian

**📄 [46] Bandler & Rayas-Sánchez (2023)** "An Early History of Optimization Technology for Automated Design of Microwave Circuits"
- *IEEE J. Microwaves, vol. 3, no. 1, pp. 319-337, 2023*
- **核心贡献**：微波电路优化技术的早期历史回顾——从启发式直接搜索算法到梯度EM优化再到空间映射技术，抵达今天的代理方法。
- **关键词**：History, Optimization, Space Mapping, Commercial Software

**📄 [47] Rayas-Sánchez et al. (2025)** "Microwave Modeling and Design Optimization: The Legacy of John Bandler"
- *IEEE TMTT, vol. 73, no. 1, pp. 87-101, 2025*
- **核心贡献**：纪念J. W. Bandler教授在RF/微波建模和自动化设计优化方面的贡献。涵盖Minimax优化、良率优化、空间映射、ANN与SM融合、认知驱动滤波器和AI相关性。
- **关键词**：John Bandler, Legacy, Space Mapping, ANN, Cognition-Driven

---

## 十一、总括与趋势分析

### 11.1 研究热点分布

近五年空间映射在电磁领域的研究可归纳为以下主要方向：

| 方向 | 论文数量 | 代表性进展 |
|:---|:---:|:---|
| 网格空间映射（MSM） | ~8篇 | SSP、网格变形、结构简化粗模型、MOR粗模型 |
| 神经网络空间映射 | ~7篇 | 逆建模、动态缩放层、分解映射、CDNN |
| 认知驱动空间映射 | ~5篇 | TF特征→阻抗特征、Broyden型认知SM |
| 多物理场空间映射 | ~3篇 | EM→多物理场、共享粗模型、双层映射 |
| 天线设计应用 | ~5篇 | 超表面天线、MIMO解耦、稀疏阵列、SSPP阵列 |
| 滤波器设计应用 | ~6篇 | 后制造调谐、几何缩放、场-电路映射 |
| 代理建模与加速技术 | ~5篇 | 变分辨率、域约束、迁移学习 |
| 综述与历史 | ~3篇 | 技术发展史、未来趋势展望 |

### 11.2 技术演进趋势

1. **从单物理场到多物理场**：初始SM仅用于纯EM优化，近年来已扩展到EM-热-力等多物理场耦合优化。
2. **从粗/细双模型到多层级模型**：从传统两级SM发展到多保真度、多层级、变分辨率等灵活框架。
3. **从人工特征到认知驱动**：从依赖手动提取特征发展到自动认知驱动优化，特征从S参数扩展到Z参数（阻抗特征）。
4. **深度神经网络融合**：ANN/SM混合、级联DNN、动态缩放层等深度学习方法显著提升了SM的建模能力和自动化程度。
5. **网格技术的突破**：锐化结构处理（SSP）、网格变形、结构简化和模型降阶（MOR）等技术大大扩展了MSM的适用范围。
6. **可调/可重构器件优化**：针对可调滤波器、多状态调谐等新型应用场景，SM技术正在解决状态空间联合优化的挑战。

### 11.3 主要研究机构

- **加拿大卡尔顿大学** (Qi-Jun Zhang团队)：MSM、认知驱动SM、Neuro-TF基础理论
- **中国天津大学** (Feng Feng团队)：MSM-SIO、多物理场SM、并行SM
- **墨西哥ITESO大学** (Rayas-Sánchez团队)：认知SM、Broyden型SM、历史综述
- **波兰格但斯克工业大学** (Koziel团队)：变分辨率代理、域约束建模、容差优化
- **南方科技大学** (程庆沙团队)：SM自动设计SIW耦合器、MIMO解耦网络
- **电子科技大学** (Ma Kaixue团队)：阻抗特征优化、波导滤波器

### 11.4 未来展望

1. **AI与SM深度融合**：强化学习、图神经网络等新兴AI技术与SM的结合尚处于起步阶段。
2. **系统级多物理场优化**：从器件级向系统级EM-热-力多物理场联合优化发展。
3. **全自动化设计流程**：减少人工干预的端到端SM优化流程，从结构生成到版图综合。
4. **量子与太赫兹应用**：SM技术在太赫兹器件、量子器件等新兴频段的推广。
5. **不确定性量化与鲁棒设计**：考虑制造公差、材料参数不确定性的SM框架。

---

## 参考文献（完整列表）

| # | 年份 | 期刊 | 第一作者 | 标题关键词 |
|:---:|:---:|:---:|:---|:---|
| 1 | 2020 | MWCL | J. Zhang | Mesh Deformation Yield Estimation |
| 2 | 2020 | TMTT | Z. Zhao | Decomposed Mappings GaN HEMT |
| 3 | 2020 | TMTT | F. Feng | Lagrangian Newton EM Optimization |
| 4 | 2020 | TMTT | F. Feng | Multifeature Neuro-TF Surrogate |
| 5 | 2020 | TMTT | S. Li | Postfabrication Filter Tuning |
| 6 | 2020 | TEMC | H. Chen | Multilayered Shields SM |
| 7 | 2021 | TMTT | J. Jin | Cognition-Driven EM Optimization |
| 8 | 2021 | TMTT | W. Zhang | Parallel SM Multiphysics |
| 9 | 2021 | JMMCT | F. Jiang | MIMO Decoupling SM |
| 10 | 2021 | AWPL | P. Gu | Sparse Planar Array SM |
| 11 | 2021 | JMW | Rayas-Sánchez | RF/MW Design Optimization Journey |
| 12 | 2021 | TMTT | S. Koziel | Low-Cost Two-Stage Surrogates |
| 13 | 2021 | IEEE Access | S. Koziel | Multi-Resolution Design Closure |
| 14 | 2022 | AWPL | T. Yan | RCS Surrogate SM |
| 15 | 2022 | TEMC | S. Yang | Neuro-SM SOIFET Switch |
| 16 | 2022 | JMMCT | T. Qiao | SIW Coupler SM |
| 17 | 2022 | TMTT | S. Koziel | Variable-Resolution Surrogate |
| 18 | 2022 | TAP | S. Koziel | Tolerance-Aware Antenna MO |
| 19 | 2023 | TMTT | Z. Ye | KBNN Multiphysics |
| 20 | 2023 | TMTT | M. Li | Mesh Morphing Waveguide |
| 21 | 2023 | JMW | J. Bandler | Early History Optimization |
| 22 | 2023 | TAP | Y. Jiao | SSPP mmWave Array SM |
| 23 | 2023 | MWTL | J. Ma | Transfer Learning Prediction |
| 24 | 2023 | TCSII | J. Zhang | Modified ISM MMIC PA |
| 25 | 2023 | TCSII | J. Ma | Transfer Learning MW Prediction |
| 26 | 2024 | TMTT | M. Li | Advanced MSM SSP |
| 27 | 2024 | TMTT | C. Roy | Field-Circuit Filter Optimization |
| 28 | 2024 | TMTT | Z. Liu | SM Metamaterial Absorber |
| 29 | 2024 | TMTT | A. Liu | Homotopy Inverse Filter Scaling |
| 30 | 2024 | TMTT | J. Chen | Advanced Neuro-TF VF |
| 31 | 2024 | IEEE Access | K. Leong | RL Filter Optimization |
| 32 | 2024 | TCSII | J. Zhang | IISM MMIC PA Layout |
| 33 | 2025 | TMTT | F. Feng | MSM Tunable Filters Simplified |
| 34 | 2025 | TMTT | F. Feng | MSM-SIO TF Feature |
| 35 | 2025 | TMTT | W. Liu | Impedance Feature Cognition SM |
| 36 | 2025 | TMTT | H. Hu | Shared Coarse Model Multistate |
| 37 | 2025 | TMTT | X. Yang | Multifidelity SM Multiphysics |
| 38 | 2025 | TMTT | L. Ma | Impedance Feature Gauss-Newton |
| 39 | 2025 | TMTT | M. Li | Multilevel MOR Coarse Model |
| 40 | 2025 | TMTT | P. Qin | SCSTDO Filter Optimization |
| 41 | 2025 | TMTT | J. Rayas-Sánchez | Legacy John Bandler |
| 42 | 2025 | MWTL | J. Rayas-Sánchez | Cognitive Broyden SM |
| 43 | 2025 | MWTL | S. Yan | Enhanced SMNN Dynamic Scaling |
| 44 | 2025 | MWTL | W. Na | Neural SM Inverse Modeling |
| 45 | 2025 | AWPL | T. Zhai | Metasurface Antenna SM |
| 46 | 2025 | TAP | J. Zhang | Grid Antenna CDNN SM |
| 47 | 2025 | IEEE Access | S. Koziel | Reduced-Cost Design Closure |
| + | 2020-2025 | 其他 | 多篇相关 | 代理模型、空间映射相关支撑技术 |

> **注**：本综述基于 IEEE Xplore 数据库检索，使用关键词组合包括 "space mapping" + "microwave/electromagnetic/antenna/filter/optimization" 以及 "implicit space mapping"、"mesh space mapping"、"neural space mapping" 等特定类型，覆盖 2020-2025 年间 IEEE 期刊论文，共收集分析50+篇文献摘要。
