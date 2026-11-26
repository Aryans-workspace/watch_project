# Master Thesis
**Title:** Cyber-Physical Systems in Watchmaking: Design and Integration of an Intelligent Quality Control Ecosystem
*Subtitle: Robotic Water Resistance Testing, AI-Based Defect Detection, and Return on Investment Analysis*

---

## Chapter 1: Introduction

### 1.1 Background and Context
In the horological industry, the quality control (QC) process is a critical determinant of product reliability and brand equity. This is especially true in the luxury sector, where aesthetic perfection and mechanical precision are the primary drivers of consumer value. The Timex Group Luxury Division operates within this exacting environment, manufacturing "Swiss Made" timepieces under license for prominent fashion houses such as Versace, Salvatore Ferragamo, and Missoni. For these brands, rigorous quality assurance is required to minimize after-sales returns and maintain market positioning.

The standard operating procedure for QC in this context involves a sequence of specialized checkpoints. Following the initial assembly stages, timepieces arrive at the final inspection station where they undergo several critical evaluations. According to the facility's documented procedures, this includes verifying the integrity of the case back closure (Check 1), conducting pneumatic water resistance (WR) testing on 100% of the production volume using Witschi Proofmaster M devices (Check 2), and verifying the movement functionality (Check 3). The process concludes with a final visual inspection (Check 6), where operators examine the watches for microscopic foreign matter—such as dust, hair, or metal shavings under the crystal—and ensure the absence of superficial scratches on the case and bezel.

### 1.2 Problem Statement
Despite the advanced engineering of the timepieces themselves, the current quality control pipeline relies heavily on traditional, manual labor and analog data collection. This reliance introduces several operational vulnerabilities that limit scalability and increase the risk of defect escapes.

The most significant vulnerability lies in the final visual inspection. Relying on human operators to consistently detect microscopic defects over an extended shift is inherently problematic. Scholarly literature on manufacturing ergonomics demonstrates that manual visual inspection is highly susceptible to performance decay. Studies indicate that an inspector's detection accuracy can decrease significantly after just 30 to 45 minutes of continuous focus due to visual and cognitive fatigue (See et al., 2017; Drury, 1992). In the context of luxury watchmaking, a momentary lapse in concentration that allows a speck of dust to pass inspection can result in a costly customer return and a negative impact on the manufacturer's reputation.

Furthermore, the physical layout and execution of the QC checks create mechanical bottlenecks. Operators are required to manually close the watch cases and then physically transfer the batches to a separate testing cell containing approximately six Proofmaster WR machines. This repetitive movement between workstations introduces non-value-added time (muda) and physical strain, effectively capping the maximum throughput of the inspection line.

Finally, the data generated during these checks is currently recorded using an analog, paper-based system. Operators log acceptable production volumes on a "Loading progress" sheet and transcribe rejected items onto a separate "Rejects sheet." This manual data entry is not only time-consuming but also creates a fragmented data environment, preventing management from accessing real-time analytics, tracking defect trends, or implementing predictive quality measures.

### 1.3 Objectives of the Thesis
This research aims to address these operational constraints by designing and proposing the implementation of a Cyber-Physical System (CPS) to automate and digitalize the horological QC pipeline. The primary objective is to develop an integrated ecosystem that eliminates human-centric bottlenecks while ensuring stringent quality standards.

To achieve this, the thesis proposes three main technical interventions:
1. **Digital Traceability Architecture:** The implementation of a custom software application to replace paper-based logging, providing a centralized, real-time database for batch tracking and defect analysis.
2. **Automated Optical Inspection (AOI):** The conceptualization of an AI-driven vision system capable of autonomously performing the final visual inspection, thereby removing the variability and fatigue associated with human operators.
3. **Robotic Machine Tending:** The architectural design of a flexible automation cell—utilizing a collaborative robot (cobot) mounted on a linear 7th-axis rail—to autonomously load and unload the bank of Proofmaster WR machines, optimizing machine utilization and reducing operator strain.

### 1.4 Aim of the Research
By integrating modern software engineering, artificial intelligence, and collaborative robotics, this thesis seeks to demonstrate the technical feasibility of a fully modernized watch inspection line. Furthermore, the research will evaluate the practical viability of this transition through a comprehensive Return on Investment (ROI) analysis, determining whether the upfront capital expenditure is justified by the subsequent improvements in throughput, labor reallocation, and the reduction of defective escapes.
